import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ───────────────────── config ─────────────────────
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const ADMIN_CHAT_ID = "144068979";
// Public channel the bot posts reports/signals/news/calendar into.
// Bot must be an admin of @goldmarketai (numeric id -1004481319450).
const CHANNEL_CHAT_ID = "@goldmarketai";
// Where reports get delivered (admin DM + public channel).
const TARGET_CHAT_IDS = [ADMIN_CHAT_ID, CHANNEL_CHAT_ID];

// Price-move thresholds that trigger a Telegram alert.
const GOLD_THRESHOLD = 2;     // $2
const OIL_THRESHOLD = 1;      // $1
const BTC_THRESHOLD = 200;    // $200

// Within how many minutes a high-impact event triggers an alert.
const EVENT_ALERT_MIN = 30;

// Internal price-scan loop: check prices every PRICE_INTERVAL_MS for up to
// LOOP_WINDOW_MS, so the engine reacts ~every 5s while the cron fires once a
// minute. News + calendar are checked once per invocation (≈60s cadence).
const PRICE_INTERVAL_MS = 5_000;
const LOOP_WINDOW_MS = 50_000;

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ───────────────────── helpers ─────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Signal = "BUY" | "SELL" | "HOLD";
// Rich color indicators: 🟢 BUY · 🔴 SELL · 🟡 HOLD (with extra colored squares for emphasis).
const sigEmoji = (s: Signal) => (s === "BUY" ? "🟢" : s === "SELL" ? "🔴" : "🟡");
const sigBadge = (s: Signal) => (s === "BUY" ? "🟢🟩" : s === "SELL" ? "🔴🟥" : "🟡🟧");
const sigKu = (s: Signal) => (s === "BUY" ? "کڕین" : s === "SELL" ? "فرۆشتن" : "هەڵگرتن");
// Colored dot for % change: green up / red down / yellow flat.
const changeDot = (pct: number) => (pct > 0 ? "🟢" : pct < 0 ? "🔴" : "🟡");

// Rule-based signal from the day's % change.
function ruleSignal(changePct: number): Signal {
  if (changePct >= 0.15) return "BUY";
  if (changePct <= -0.15) return "SELL";
  return "HOLD";
}

interface Quote { symbol: string; price: number; changePct: number; }

// ───────────────────── price sources ─────────────────────
async function fetchGold(): Promise<Quote | null> {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const price = Number(d?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol: "XAU/USD", price: +price.toFixed(2), changePct: 0 };
  } catch { return null; }
}

async function fetchBtc(): Promise<Quote | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const price = Number(d?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol: "BTC/USD", price: +price.toFixed(2), changePct: Number(d?.priceChangePercent) || 0 };
  } catch { return null; }
}

async function fetchOil(): Promise<Quote | null> {
  // Free Yahoo Finance feed for WTI crude (CL=F) — price + % change vs prev close.
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const m = d?.chart?.result?.[0]?.meta;
    const price = Number(m?.regularMarketPrice);
    const prev = Number(m?.chartPreviousClose ?? m?.previousClose);
    if (!Number.isFinite(price) || price <= 0) return null;
    const changePct = Number.isFinite(prev) && prev > 0 ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
    return { symbol: "WTI/USD", price: +price.toFixed(2), changePct };
  } catch { return null; }
}

// Track an intraday open so gold gets a real % change (gold-api gives only spot).
const dayOpen: Record<string, { day: string; open: number }> = {};
function applyChange(q: Quote): Quote {
  const day = new Date().toISOString().slice(0, 10);
  const s = dayOpen[q.symbol];
  if (!s || s.day !== day) {
    dayOpen[q.symbol] = { day, open: q.price };
    return q;
  }
  if (!q.changePct && s.open > 0) {
    q.changePct = +(((q.price - s.open) / s.open) * 100).toFixed(2);
  }
  return q;
}

async function getPrices(): Promise<Quote[]> {
  const [gold, oil, btc] = await Promise.all([fetchGold(), fetchOil(), fetchBtc()]);
  return [gold, oil, btc].filter((q): q is Quote => !!q).map(applyChange);
}

// ───────────────────── economic calendar ─────────────────────
interface CalEvent { key: string; title: string; currency: string; impact: string; time: number; forecast: string; previous: string; }

async function getHighImpactEvents(): Promise<CalEvent[]> {
  try {
    const res = await fetch(CALENDAR_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const out: CalEvent[] = [];
    for (const e of Array.isArray(data) ? data : []) {
      const impact = String(e.impact ?? "").toLowerCase();
      if (impact !== "high") continue;
      const t = e.date ? new Date(e.date).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      out.push({
        key: `${e.title}|${e.country}|${e.date}`,
        title: String(e.title ?? "Event"),
        currency: String(e.country ?? ""),
        impact: "HIGH",
        time: t,
        forecast: String(e.forecast ?? ""),
        previous: String(e.previous ?? ""),
      });
    }
    return out;
  } catch { return []; }
}

// ───────────────────── alert state (dedupe) ─────────────────────
async function getState(key: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from("market_alert_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as Record<string, unknown>) ?? {};
}
async function setState(key: string, value: Record<string, unknown>) {
  await admin.from("market_alert_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

// ───────────────────── Telegram (retry + backoff) ─────────────────────
async function sendToChat(chatId: string, kind: string, text: string): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const { data: logRow } = await admin.from("telegram_logs")
    .insert({ kind, chat_id: chatId, payload: { text }, status: "pending", attempts: 0 })
    .select("id").maybeSingle();
  const logId = logRow?.id as string | undefined;

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    if (logId) await admin.from("telegram_logs").update({ status: "failed", error: "Missing Telegram credentials" }).eq("id", logId);
    return false;
  }

  const backoff = [1000, 2000, 4000];
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        if (logId) await admin.from("telegram_logs").update({ status: "sent", attempts: attempt }).eq("id", logId);
        return true;
      }
      lastErr = `[${res.status}] ${JSON.stringify(d)}`;
    } catch (e) {
      lastErr = String(e);
    }
    if (attempt < 3) await sleep(backoff[attempt - 1]);
  }
  if (logId) await admin.from("telegram_logs").update({ status: "failed", attempts: 3, error: lastErr }).eq("id", logId);
  return false;
}

// Broadcast to admin DM + public channel. Succeeds if any target accepts it.
async function sendTelegram(kind: string, text: string): Promise<boolean> {
  const results = await Promise.all(
    TARGET_CHAT_IDS.map((id) => sendToChat(id, kind, text)),
  );
  return results.some(Boolean);
}

// ───────────────────── message builders ─────────────────────
// pip       = price distance that equals "1 pip" for this asset (for pip counting)
// tpPct/slPct = full target / stop-loss distance as % of entry price (R:R ~1.5)
// requireSession = only open new signals while a major FX session is live (BTC = 24/7)
const ASSET_META: Record<
  string,
  { emoji: string; name: string; threshold: number; pip: number; tpPct: number; slPct: number; requireSession: boolean }
> = {
  "XAU/USD": { emoji: "🥇", name: "GOLD", threshold: GOLD_THRESHOLD, pip: 0.1, tpPct: 0.6, slPct: 0.4, requireSession: true },
  "WTI/USD": { emoji: "🛢", name: "OIL", threshold: OIL_THRESHOLD, pip: 0.01, tpPct: 0.8, slPct: 0.5, requireSession: true },
  "BTC/USD": { emoji: "₿", name: "BITCOIN", threshold: BTC_THRESHOLD, pip: 1, tpPct: 1.2, slPct: 0.8, requireSession: false },
};

// Round pips to whole numbers for clean messaging.
const toPips = (priceMove: number, pip: number) => Math.round(Math.abs(priceMove) / pip);

// ───────────────────── market sessions (UTC) ─────────────────────
interface SessionDef { name: string; ku: string; start: number; end: number; }
const SESSIONS: SessionDef[] = [
  { name: "Sydney", ku: "سیدنی", start: 21, end: 6 },
  { name: "Tokyo", ku: "تۆکیۆ", start: 0, end: 9 },
  { name: "London", ku: "لەندەن", start: 7, end: 16 },
  { name: "New York", ku: "نیویۆرک", start: 12, end: 21 },
];
function openSessions(d = new Date()): SessionDef[] {
  const h = d.getUTCHours();
  return SESSIONS.filter((s) => (s.start <= s.end ? h >= s.start && h < s.end : h >= s.start || h < s.end));
}
// A "major" session (London / New York) means high liquidity → good entry timing.
function isMajorSessionOpen(d = new Date()): boolean {
  return openSessions(d).some((s) => s.name === "London" || s.name === "New York");
}
function sessionLabel(d = new Date()): string {
  const open = openSessions(d);
  if (open.length === 0) return "Closed / داخراو";
  return open.map((s) => `${s.name} (${s.ku})`).join(" + ");
}

function priceLine(q: Quote, sig: Signal): string {
  const m = ASSET_META[q.symbol];
  const up = q.changePct >= 0;
  const arrow = up ? "🟢▲" : "🔴▼";
  const pct = `${up ? "+" : ""}${q.changePct.toFixed(2)}%`;
  return [
    `${m.emoji} <b>${m.name} (${esc(q.symbol)})</b>`,
    `Price: <code>$${q.price.toLocaleString("en-US")}</code> ${arrow} ${pct}`,
    `Signal: ${sigBadge(sig)} <b>${sig}</b> · کاریگەری: ${sigKu(sig)}`,
  ].join("\n");
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Full BUY/SELL trade setup with entry, full target and stop loss.
function newSignalLine(
  q: Quote, sig: "BUY" | "SELL", tp: number, sl: number, tpPips: number, slPips: number,
  confidence: number, session: string,
): string {
  const m = ASSET_META[q.symbol];
  // Yellow/orange for medium confidence, green for high.
  const confDot = confidence >= 80 ? "🟢" : confidence >= 70 ? "🟡" : "🟠";
  return [
    `${m.emoji} <b>${m.name} (${esc(q.symbol)})</b>`,
    `${sigBadge(sig)} <b>${sig}</b> / ${sigKu(sig)}`,
    `📍 Entry / دەستپێک: <code>$${fmt(q.price)}</code>`,
    `🎯🟢 TP / تارگێت: <code>$${fmt(tp)}</code> (+${tpPips} pips)`,
    `🛑🔴 SL / لۆست ستۆپ: <code>$${fmt(sl)}</code> (-${slPips} pips)`,
    `📊 Confidence / متمانە: ${confDot} <b>${confidence}%</b>`,
    `🏙 Session / بازاڕ: ${session}`,
  ].join("\n");
}

// Outcome message when a signal closes on TP or SL.
function outcomeLine(
  symbol: string, sig: "BUY" | "SELL", hit: "tp" | "sl",
  entry: number, close: number, pips: number,
): string {
  const m = ASSET_META[symbol];
  if (hit === "tp") {
    return [
      `🟢✅ <b>TARGET HIT / تارگێت تەواوبوو</b> 🎉`,
      `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig}`,
      `📈🟢 Result / ئەنجام: <b>+${pips} pips</b>`,
      `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
      `سیگنالەکە سەرکەوتوو بوو 🟢✅`,
    ].join("\n");
  }
  return [
    `🔴❌ <b>STOP LOSS / لۆست ستۆپ</b>`,
    `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig}`,
    `📉🔴 Result / ئەنجام: <b>-${pips} pips</b>`,
    `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
    `🟠⚠️ پێشبینییەکە هەڵە بوو — ئەم نۆتە چیتر ئەکتیڤ نییە`,
    `🚪 تکایە پۆزیشنەکە دابخە / Please close your position`,
  ].join("\n");
}

function nowStamp(): string {
  return new Date().toUTCString();
}

// ───────────────────── core scan ─────────────────────
interface OpenSig { id?: string; signal: "BUY" | "SELL"; entry: number; tp: number; sl: number; }

async function evaluatePrices(): Promise<{ signalAlerts: string[]; outcomeAlerts: string[]; quotes: Quote[] }> {
  const quotes = await getPrices();
  const priceState = await getState("prices");      // { "XAU/USD": { price, signal } }
  const openState = await getState("open_signals"); // { "XAU/USD": OpenSig }
  const signalAlerts: string[] = [];
  const outcomeAlerts: string[] = [];

  for (const q of quotes) {
    const m = ASSET_META[q.symbol];
    if (!m) continue;
    const sig = ruleSignal(q.changePct);

    // Persist latest snapshot for the dashboard.
    await admin.from("market_prices").upsert({
      symbol: q.symbol, price: q.price, change_pct: q.changePct,
      trend: q.changePct >= 0 ? "up" : "down", signal: sig, updated_at: new Date().toISOString(),
    });

    const open = openState[q.symbol] as OpenSig | undefined;

    // 1) Manage an OPEN position → did price hit TP or SL?
    if (open) {
      const isBuy = open.signal === "BUY";
      let hit: "tp" | "sl" | null = null;
      if (isBuy) {
        if (q.price >= open.tp) hit = "tp";
        else if (q.price <= open.sl) hit = "sl";
      } else {
        if (q.price <= open.tp) hit = "tp";
        else if (q.price >= open.sl) hit = "sl";
      }
      if (hit) {
        const pips = toPips(q.price - open.entry, m.pip);
        outcomeAlerts.push(outcomeLine(q.symbol, open.signal, hit, open.entry, q.price, pips));
        if (open.id) {
          await admin.from("ai_signals").update({
            status: hit === "tp" ? "target_hit" : "stopped_out",
            result_pips: hit === "tp" ? pips : -pips,
            close_price: q.price,
            closed_at: new Date().toISOString(),
          }).eq("id", open.id);
        }
        delete openState[q.symbol];
      }
      // Only one active signal per symbol — never stack a second one.
      priceState[q.symbol] = { price: q.price, signal: sig };
      continue;
    }

    // 2) No open position → consider opening a NEW signal when timing is right.
    const prev = priceState[q.symbol] as { price?: number; signal?: Signal } | undefined;
    const actionable = sig === "BUY" || sig === "SELL";
    const timingOk = !m.requireSession || isMajorSessionOpen();
    // Avoid re-opening the same direction immediately; only fire when signal flips.
    const fresh = prev?.signal !== sig;

    if (actionable && timingOk && fresh) {
      const isBuy = sig === "BUY";
      const tp = +(q.price * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
      const sl = +(q.price * (isBuy ? 1 - m.slPct / 100 : 1 + m.slPct / 100)).toFixed(2);
      const tpPips = toPips(tp - q.price, m.pip);
      const slPips = toPips(sl - q.price, m.pip);
      const confidence = Math.min(95, 60 + Math.round(Math.abs(q.changePct) * 10));
      const session = sessionLabel();

      const { data: ins } = await admin.from("ai_signals").insert({
        asset: m.name, signal: sig, entry: q.price, tp, sl,
        confidence, status: "open", market_session: session, tp_pips: tpPips, sl_pips: slPips,
      }).select("id").maybeSingle();

      signalAlerts.push(newSignalLine(q, sig as "BUY" | "SELL", tp, sl, tpPips, slPips, confidence, session));
      openState[q.symbol] = { id: ins?.id as string | undefined, signal: sig as "BUY" | "SELL", entry: q.price, tp, sl };
    }
    priceState[q.symbol] = { price: q.price, signal: sig };
  }

  await setState("prices", priceState);
  await setState("open_signals", openState);
  return { signalAlerts, outcomeAlerts, quotes };
}


async function evaluateCalendar(): Promise<string[]> {
  const events = await getHighImpactEvents();
  const state = await getState("events"); // { alertedKeys: string[] }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const now = Date.now();
  const out: string[] = [];

  for (const ev of events) {
    // Persist upcoming events for the dashboard.
    await admin.from("economic_events").upsert({
      ext_key: ev.key, title: ev.title, currency: ev.currency, impact: ev.impact,
      event_time: new Date(ev.time).toISOString(), forecast: ev.forecast, previous: ev.previous,
    }, { onConflict: "ext_key" });

    const minutes = (ev.time - now) / 60_000;
    if (minutes >= 0 && minutes <= EVENT_ALERT_MIN && !alerted.has(ev.key)) {
      alerted.add(ev.key);
      out.push([
        `🟠⚠️ <b>${esc(ev.title)}</b> (${esc(ev.currency)})`,
        `🕒 In ${Math.round(minutes)} min · لە ${Math.round(minutes)} خولەکدا`,
        ev.forecast ? `Forecast: <code>${esc(ev.forecast)}</code> · Prev: <code>${esc(ev.previous)}</code>` : "",
      ].filter(Boolean).join("\n"));
    }
  }
  // Keep last 100 alerted keys.
  await setState("events", { alertedKeys: [...alerted].slice(-100) });
  return out;
}

// ───────────────────── market news (live fetch + bilingual) ─────────────────────
interface NewsItem { title: string; link: string; source: string; category: string; pubDate: string; summary: string; }

const NEWS_SOURCES: { url: string; source: string; category: string }[] = [
  { url: "https://www.investing.com/rss/news_1.rss", source: "Investing.com", category: "forex" },
  { url: "https://www.investing.com/rss/news_11.rss", source: "Investing.com", category: "commodities" },
  { url: "https://www.investing.com/rss/news_301.rss", source: "Investing.com", category: "crypto" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC", category: "economy" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", category: "markets" },
];

const RELEVANT_RE = /\b(gold|silver|xau|bullion|precious metal|oil|crude|brent|wti|opec|natural gas|energy|forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy|exchange rate|fed|federal reserve|fomc|ecb|boe|boj|central bank|rate cut|rate hike|interest rate|inflation|cpi|ppi|gdp|jobs report|payroll|nonfarm|unemployment|treasury|bond|yield|stock|stocks|equities|market|markets|index|s&p|nasdaq|dow|wall street|commodity|commodities|bitcoin|btc|ethereum|crypto|recession|economy|economic|tariff|trade war|earnings|powell)\b/i;
const IRRELEVANT_RE = /(\bmy plumber\b|should i quit|quit my job|retire(ment| early)|i'?m \d+ (and|with|years)|personal finance|my (husband|wife|mom|dad|son|daughter|kid|family)|dear (penny|abby)|suze orman|dave ramsey|here'?s how (much|i)|how i (saved|retired|paid|built|became)|i regret|side hustle|frugal|coupon|credit card (debt|rewards|points)|net worth at|millionaire next door|budget(ing)? tips|grocery|honeymoon|wedding|inheritance from)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "\u2026").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&lsquo;/g, "\u2018").replace(/&rsquo;/g, "\u2019").replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D")
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ""; } })
    .replace(/\s+/g, " ").trim();
}
function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}
function categorize(text: string): string {
  const t = text.toLowerCase();
  if (/\b(gold|xau|bullion|silver|precious metal)\b/.test(t)) return "GOLD";
  if (/\b(oil|crude|brent|wti|opec|natural gas)\b/.test(t)) return "OIL";
  if (/\b(bitcoin|btc|ethereum|eth|crypto|blockchain)\b/.test(t)) return "CRYPTO";
  if (/\b(forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy)\b/.test(t)) return "FOREX";
  return "MARKETS";
}
function firstSentence(s: string): string {
  if (!s) return "";
  const m = s.match(/^.*?[.!?](\s|$)/);
  let out = (m ? m[0] : s).trim();
  if (out.length > 160) out = out.slice(0, 157) + "...";
  return out;
}
function parseRss(xml: string, source: string, fallbackCategory: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    if (!title) continue;
    const link = pickTag(block, "link");
    const pubDate = pickTag(block, "pubDate") || pickTag(block, "dc:date");
    const rawSummary = pickTag(block, "description");
    const combined = `${title} ${rawSummary}`;
    if (IRRELEVANT_RE.test(combined) || !RELEVANT_RE.test(combined)) continue;
    items.push({ title, link, source, category: categorize(combined) || fallbackCategory, pubDate, summary: firstSentence(rawSummary) });
  }
  return items;
}
async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (s) => {
      const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { await r.text(); return [] as NewsItem[]; }
      return parseRss(await r.text(), s.source, s.category).slice(0, 10);
    }),
  );
  let all: NewsItem[] = [];
  for (const r of results) if (r.status === "fulfilled") all = all.concat(r.value);
  const seen = new Set<string>();
  all = all.filter((n) => { const k = (n.link || n.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  all.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
  return all;
}

// Translate a batch of English headlines to Kurdish (Sorani) in a single AI call.
async function translateToKurdish(titles: string[]): Promise<string[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || titles.length === 0) return titles.map(() => "");
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a financial news translator. Translate each English market headline into clear, natural Kurdish (Sorani / کوردیی ناوەندی). Reply ONLY with a JSON array of strings, same order, same length. No extra text." },
          { role: "user", content: JSON.stringify(titles) },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { await res.text(); return titles.map(() => ""); }
    const d = await res.json();
    let content = String(d?.choices?.[0]?.message?.content ?? "").trim();
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const arr = JSON.parse(content);
    if (Array.isArray(arr) && arr.length === titles.length) return arr.map((x) => String(x ?? ""));
  } catch (e) {
    console.error("translateToKurdish failed", e);
  }
  return titles.map(() => "");
}

function newsLine(title: string, titleKu: string, summary: string, category: string, source: string): string {
  const parts = [`• <b>${esc(title)}</b>`];
  if (titleKu) parts.push(`  🇹🇯 ${esc(titleKu)}`);
  if (summary) parts.push(`  <i>${esc(summary)}</i>`);
  const meta = [category ? `🏷 ${esc(category)}` : "", source ? esc(source) : ""].filter(Boolean).join(" · ");
  if (meta) parts.push(`  <i>${meta}</i>`);
  return parts.join("\n");
}

async function evaluateNews(): Promise<string[]> {
  const news = await fetchNews();
  const state = await getState("news"); // { alertedKeys: string[] }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const now = Date.now();

  // Pick up to 4 new, fresh (≤90 min old) items we have not alerted yet.
  const fresh: NewsItem[] = [];
  for (const n of news) {
    const key = (n.link || n.title).toLowerCase();
    if (alerted.has(key)) continue;
    alerted.add(key);
    const ts = Date.parse(n.pubDate) || 0;
    if (ts && now - ts > 90 * 60 * 1000) continue;
    fresh.push(n);
    if (fresh.length >= 4) break;
  }
  await setState("news", { alertedKeys: [...alerted].slice(-300) });
  if (fresh.length === 0) return [];

  const kuTitles = await translateToKurdish(fresh.map((n) => n.title));

  // Persist for the dashboard (best-effort).
  const out: string[] = [];
  for (let i = 0; i < fresh.length; i++) {
    const n = fresh[i];
    const ku = kuTitles[i] ?? "";
    const hash = (n.link || n.title).toLowerCase();
    await admin.from("market_news").upsert({
      hash, title: n.title, title_ku: ku || null, summary: n.summary || null,
      impact: n.category, bias: null, source: n.source, url: n.link,
      published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
    }, { onConflict: "hash" });
    out.push(newsLine(n.title, ku, n.summary, n.category, n.source));
  }
  return out;
}

// ───────────────────── HTTP ─────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron sends none */ }
    const loop = body.loop !== false; // default true; pass {loop:false} for a single pass
    const test = body.test === true;  // pass {test:true} to force a sample report to Telegram

    // Test mode: send a full bilingual CTP APP REPORTS sample right now so you can
    // confirm it lands in the bot chat — bypasses the dedupe/trigger logic.
    if (test) {
      const quotes = await getPrices();
      const priceBlock = quotes.map((q) => priceLine(q, ruleSignal(q.changePct)));

      // Build a sample full trade signal + a sample TP outcome from live gold price.
      const sample = quotes[0] ?? { symbol: "XAU/USD", price: 4275, changePct: 0.3 } as Quote;
      const sm = ASSET_META[sample.symbol] ?? ASSET_META["XAU/USD"];
      const sampleTp = +(sample.price * (1 + sm.tpPct / 100)).toFixed(2);
      const sampleSl = +(sample.price * (1 - sm.slPct / 100)).toFixed(2);
      const sTpPips = toPips(sampleTp - sample.price, sm.pip);
      const sSlPips = toPips(sampleSl - sample.price, sm.pip);
      const signalSample = newSignalLine(sample, "BUY", sampleTp, sampleSl, sTpPips, sSlPips, 78, sessionLabel());
      const outcomeSample = outcomeLine(sample.symbol, "BUY", "tp", sample.price, sampleTp, sTpPips);

      const liveNews = (await fetchNews()).slice(0, 3);
      const kuTitles = await translateToKurdish(liveNews.map((n) => n.title));
      const newsBlock = liveNews.map((n, i) => newsLine(n.title, kuTitles[i] ?? "", n.summary, n.category, n.source));
      const lines: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Market News & Analysis · هەواڵ و شیکاری بازاڕ</i>",
        "<i>🧪 TEST / تاقیکردنەوە</i>",
        "━━━━━━━━━━━━━━━",
        "",
        "🚨 <b>New Signals / سیگنالی نوێ</b>",
        "",
        signalSample,
        "",
        "🏁 <b>Signal Results / ئەنجامی سیگنال</b>",
        "",
        outcomeSample,
        "",
        "📈 <b>Analysis / شیکاری بازاڕ</b>",
        "",
        priceBlock.length ? priceBlock.join("\n\n") : "—",
        "",
      ];
      if (newsBlock.length) {
        lines.push("📰 <b>Market News / هەواڵی بازاڕ</b>", "", newsBlock.join("\n\n"), "");
      }
      lines.push("━━━━━━━━━━━━━━━");
      lines.push(`<i>🕒 ${nowStamp()}</i>`);
      lines.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      const ok = await sendTelegram("ctp_report_test", lines.join("\n"));
      return new Response(JSON.stringify({ ok: true, sent: ok, mode: "test", quotes: quotes.length, news: newsBlock.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const signalAlerts: string[] = [];
    const outcomeAlerts: string[] = [];
    let lastQuotes: Quote[] = [];

    if (loop) {
      const start = Date.now();
      while (Date.now() - start < LOOP_WINDOW_MS) {
        const r = await evaluatePrices();
        signalAlerts.push(...r.signalAlerts);
        outcomeAlerts.push(...r.outcomeAlerts);
        lastQuotes = r.quotes;
        if (Date.now() - start + PRICE_INTERVAL_MS >= LOOP_WINDOW_MS) break;
        await sleep(PRICE_INTERVAL_MS);
      }
    } else {
      const r = await evaluatePrices();
      signalAlerts.push(...r.signalAlerts);
      outcomeAlerts.push(...r.outcomeAlerts);
      lastQuotes = r.quotes;
    }

    // Calendar + news once per invocation (≈60s cadence).
    const eventAlerts = await evaluateCalendar();
    const newsAlerts = await evaluateNews();

    let sent = false;

    // 1) Time-sensitive TRADE SIGNALS: outcomes (close now!) + fresh BUY/SELL setups.
    if (signalAlerts.length || outcomeAlerts.length) {
      const s: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Trade Signals · سیگنالی بازرگانی</i>",
        "━━━━━━━━━━━━━━━",
        "",
      ];
      if (outcomeAlerts.length) {
        s.push("🏁 <b>Signal Results / ئەنجامی سیگنال</b>", "");
        s.push(outcomeAlerts.join("\n\n"), "");
      }
      if (signalAlerts.length) {
        s.push("🚨 <b>New Signals / سیگنالی نوێ</b>", "");
        s.push(signalAlerts.join("\n\n"), "");
      }
      s.push("━━━━━━━━━━━━━━━");
      s.push(`<i>🕒 ${nowStamp()}</i>`);
      s.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      sent = (await sendTelegram("ctp_signal", s.join("\n"))) || sent;
    }

    // 2) News + economic calendar report.
    if (eventAlerts.length || newsAlerts.length) {
      const lines: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Market News & Analysis · هەواڵ و شیکاری بازاڕ</i>",
        "━━━━━━━━━━━━━━━",
        "",
      ];
      if (newsAlerts.length) {
        lines.push("📰 <b>Market News / هەواڵی بازاڕ</b>", "");
        lines.push(newsAlerts.join("\n\n"), "");
      }
      if (eventAlerts.length) {
        lines.push("🗓 <b>Economic Calendar / ساڵنامەی ئابووری</b>", "");
        lines.push(eventAlerts.join("\n\n"), "");
      }
      lines.push("━━━━━━━━━━━━━━━");
      lines.push(`<i>🕒 ${nowStamp()}</i>`);
      lines.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      sent = (await sendTelegram("ctp_report", lines.join("\n"))) || sent;
    }

    return new Response(
      JSON.stringify({ ok: true, sent, signalAlerts: signalAlerts.length, outcomeAlerts: outcomeAlerts.length, eventAlerts: eventAlerts.length, newsAlerts: newsAlerts.length, quotes: lastQuotes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("market-intel error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
