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
const sigEmoji = (s: Signal) => (s === "BUY" ? "🟢" : s === "SELL" ? "🔴" : "🟡");
const sigKu = (s: Signal) => (s === "BUY" ? "کڕین" : s === "SELL" ? "فرۆشتن" : "هەڵگرتن");

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
async function sendTelegram(kind: string, text: string): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const { data: logRow } = await admin.from("telegram_logs")
    .insert({ kind, chat_id: ADMIN_CHAT_ID, payload: { text }, status: "pending", attempts: 0 })
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
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
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

// ───────────────────── message builders ─────────────────────
const ASSET_META: Record<string, { emoji: string; name: string; threshold: number }> = {
  "XAU/USD": { emoji: "🥇", name: "GOLD", threshold: GOLD_THRESHOLD },
  "WTI/USD": { emoji: "🛢", name: "OIL", threshold: OIL_THRESHOLD },
  "BTC/USD": { emoji: "₿", name: "BITCOIN", threshold: BTC_THRESHOLD },
};

function priceLine(q: Quote, sig: Signal): string {
  const m = ASSET_META[q.symbol];
  const arrow = q.changePct >= 0 ? "▲" : "▼";
  const pct = `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`;
  return [
    `${m.emoji} <b>${m.name} (${esc(q.symbol)})</b>`,
    `Price: <code>$${q.price.toLocaleString("en-US")}</code> ${arrow} ${pct}`,
    `Signal: ${sigEmoji(sig)} <b>${sig}</b> · کاریگەری: ${sigKu(sig)}`,
  ].join("\n");
}

function nowStamp(): string {
  return new Date().toUTCString();
}

// ───────────────────── core scan ─────────────────────
async function evaluatePrices(): Promise<{ alerts: string[]; quotes: Quote[] }> {
  const quotes = await getPrices();
  const state = await getState("prices"); // { "XAU/USD": { price, signal } }
  const alerts: string[] = [];

  for (const q of quotes) {
    const m = ASSET_META[q.symbol];
    if (!m) continue;
    const sig = ruleSignal(q.changePct);
    const prev = state[q.symbol] as { price?: number; signal?: Signal } | undefined;

    // Persist latest snapshot for the (future) dashboard.
    await admin.from("market_prices").upsert({
      symbol: q.symbol, price: q.price, change_pct: q.changePct,
      trend: q.changePct >= 0 ? "up" : "down", signal: sig, updated_at: new Date().toISOString(),
    });

    let trigger = false;
    // Trigger 1: price moved more than the asset threshold since last alert.
    if (prev?.price != null && Math.abs(q.price - prev.price) >= m.threshold) trigger = true;
    // Trigger 2: signal flipped (BUY↔SELL↔HOLD).
    const signalChanged = prev?.signal != null && prev.signal !== sig;
    if (signalChanged) trigger = true;

    if (trigger) {
      alerts.push(priceLine(q, sig));
      // Record an AI signal row whenever the signal changes.
      if (signalChanged || prev?.signal == null) {
        const isBuy = sig === "BUY";
        await admin.from("ai_signals").insert({
          asset: m.name, signal: sig,
          entry: q.price,
          tp: sig === "HOLD" ? null : +(q.price * (isBuy ? 1.006 : 0.994)).toFixed(2),
          sl: sig === "HOLD" ? null : +(q.price * (isBuy ? 0.996 : 1.004)).toFixed(2),
          confidence: Math.min(95, 60 + Math.round(Math.abs(q.changePct) * 10)),
        });
      }
      state[q.symbol] = { price: q.price, signal: sig };
    } else if (prev == null) {
      // Seed state without alerting on first ever run.
      state[q.symbol] = { price: q.price, signal: sig };
    }
  }
  await setState("prices", state);
  return { alerts, quotes };
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
        `⚠️ <b>${esc(ev.title)}</b> (${esc(ev.currency)})`,
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
  if (titleKu) parts.push(`  🇮🇶 ${esc(titleKu)}`);
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
      const liveNews = (await fetchNews()).slice(0, 3);
      const kuTitles = await translateToKurdish(liveNews.map((n) => n.title));
      const newsBlock = liveNews.map((n, i) => newsLine(n.title, kuTitles[i] ?? "", n.summary, n.category, n.source));
      const lines: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Market News & Analysis · هەواڵ و شیکاری بازاڕ</i>",
        "<i>🧪 TEST / تاقیکردنەوە</i>",
        "━━━━━━━━━━━━━━━",
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

    const priceAlerts: string[] = [];
    let lastQuotes: Quote[] = [];

    if (loop) {
      const start = Date.now();
      while (Date.now() - start < LOOP_WINDOW_MS) {
        const { alerts, quotes } = await evaluatePrices();
        priceAlerts.push(...alerts);
        lastQuotes = quotes;
        if (Date.now() - start + PRICE_INTERVAL_MS >= LOOP_WINDOW_MS) break;
        await sleep(PRICE_INTERVAL_MS);
      }
    } else {
      const { alerts, quotes } = await evaluatePrices();
      priceAlerts.push(...alerts);
      lastQuotes = quotes;
    }

    // Calendar + news once per invocation (≈60s cadence).
    const eventAlerts = await evaluateCalendar();
    const newsAlerts = await evaluateNews();

    // Compose & send a single premium bilingual report if anything fired.
    let sent = false;
    if (priceAlerts.length || eventAlerts.length || newsAlerts.length) {
      const lines: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Market News & Analysis · هەواڵ و شیکاری بازاڕ</i>",
        "━━━━━━━━━━━━━━━",
        "",
      ];
      if (priceAlerts.length) {
        lines.push("📈 <b>Analysis / شیکاری بازاڕ</b>", "");
        lines.push(priceAlerts.join("\n\n"), "");
      }
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
      sent = await sendTelegram("ctp_report", lines.join("\n"));
    }

    return new Response(
      JSON.stringify({ ok: true, sent, priceAlerts: priceAlerts.length, eventAlerts: eventAlerts.length, newsAlerts: newsAlerts.length, quotes: lastQuotes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("market-intel error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
