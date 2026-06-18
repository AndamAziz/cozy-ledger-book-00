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

// Within how many minutes a high-impact event triggers the first heads-up alert.
const EVENT_ALERT_MIN = 30;
// Final "5 minutes left" reminder window before a high-impact event releases.
const EVENT_REMINDER_MIN = 5;

// Anti-spam: only open a NEW signal when the day's move is clearly strong
// (|change| >= this %) AND not within the cooldown window of the last signal
// for that symbol. Quiet markets → no repeated signals.
const SIGNAL_MIN_MOVE_PCT = 0.25;        // ignore weak/flat moves
const SIGNAL_COOLDOWN_MS = 20 * 60_000;  // 20 min between signals per symbol

// Target broadcast pacing: a "very important" target (high confidence / strong
// move / news-driven) is sent immediately. Otherwise targets are throttled so we
// broadcast at most one ordinary target every TARGET_MIN_GAP_MS (15–30 min band).
const TARGET_MIN_GAP_MS = 18 * 60_000;   // ~18 min between ordinary targets (15–30 range)
const TARGET_IMPORTANT_CONFIDENCE = 85;  // confidence ≥ this ⇒ send target now
const TARGET_IMPORTANT_MOVE_PCT = 0.6;   // |change| ≥ this % ⇒ send target now

// Internal price-scan loop: check prices every PRICE_INTERVAL_MS for up to
// LOOP_WINDOW_MS, so the engine reacts ~every 5s while the cron fires once a
// minute. News + calendar are checked once per invocation (≈60s cadence).
const PRICE_INTERVAL_MS = 5_000;
const LOOP_WINDOW_MS = 50_000;

// News is broadcast at most once per 60 minutes (its own standalone message).
const NEWS_MIN_GAP_MS = 60 * 60_000;

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
interface CalEvent { key: string; title: string; currency: string; impact: string; time: number; forecast: string; previous: string; actual: string; }

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
        actual: String(e.actual ?? ""),
      });
    }
    return out;
  } catch { return []; }
}

// Parse a calendar figure like "3.2%", "215K", "-0.1", "1.2M" into a number.
function parseFigure(s: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/k/i.test(s)) n *= 1_000;
  else if (/m/i.test(s)) n *= 1_000_000;
  else if (/b/i.test(s)) n *= 1_000_000_000;
  return Number.isFinite(n) ? n : null;
}

// Indicators where a HIGHER actual is BAD for the currency (invert the surprise).
const INVERSE_RE = /(unemployment|jobless|claims|inflation expectation|deficit|misery)/i;

// Decide gold direction from a USD data surprise.
// Strong USD data → USD up → Gold down (SELL). Weak USD data → Gold up (BUY).
function goldFromUsdSurprise(title: string, actual: number, forecast: number): {
  dir: "BUY" | "SELL" | "HOLD"; usd: "stronger" | "weaker" | "in-line";
} {
  if (actual === forecast) return { dir: "HOLD", usd: "in-line" };
  let usdStrong = actual > forecast;          // higher number usually = stronger USD
  if (INVERSE_RE.test(title)) usdStrong = !usdStrong; // unemployment/claims: higher = weaker
  return usdStrong ? { dir: "SELL", usd: "stronger" } : { dir: "BUY", usd: "weaker" };
}


// ───────────────────── alert state (dedupe) ─────────────────────
async function getState(key: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from("market_alert_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as Record<string, unknown>) ?? {};
}
async function setState(key: string, value: Record<string, unknown>) {
  await admin.from("market_alert_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

// ───────────────────── content dedupe (sent_news_log) ─────────────────────
// Stable content hash (djb2) of the normalized text — used to detect when the
// EXACT same content was already posted recently so we never spam duplicates.
function contentHash(s: string): string {
  const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// True if the same content hash was sent within the given window (ms).
async function wasRecentlySent(hash: string, withinMs: number): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await admin
    .from("sent_news_log")
    .select("id")
    .eq("content_hash", hash)
    .gte("sent_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// Record that a piece of content was sent (for future dedupe checks).
async function recordSent(hash: string, headline: string, kind: string) {
  await admin.from("sent_news_log").insert({ content_hash: hash, headline: headline.slice(0, 300), kind });
}

// Dedupe windows for each message type.
const NEWS_DEDUPE_MS = 2 * 60 * 60_000;   // 2 hours — never repeat the same headline
const SIGNAL_DEDUPE_MS = 15 * 60_000;     // 15 min — never repeat the exact same signal
const RESULT_DEDUPE_MS = 60 * 60_000;     // 1 hour — never repeat the exact same result

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
interface SessionDef { name: string; ku: string; region: "Asia" | "London" | "New York"; emoji: string; start: number; end: number; }
const SESSIONS: SessionDef[] = [
  { name: "Sydney", ku: "سیدنی", region: "Asia", emoji: "🌏", start: 21, end: 6 },
  { name: "Tokyo", ku: "تۆکیۆ", region: "Asia", emoji: "🌏", start: 0, end: 9 },
  { name: "London", ku: "لەندەن", region: "London", emoji: "🇬🇧", start: 7, end: 16 },
  { name: "New York", ku: "نیویۆرک", region: "New York", emoji: "🇺🇸", start: 12, end: 21 },
];
// Kurdish names per region for the report.
const REGION_KU: Record<string, string> = { Asia: "ئاسیا", London: "لەندەن", "New York": "نیویۆرک" };
const REGION_EMOJI: Record<string, string> = { Asia: "🌏", London: "🇬🇧", "New York": "🇺🇸" };
type Region = "Asia" | "London" | "New York";
const ALL_REGIONS: Region[] = ["Asia", "London", "New York"];

// Which market regions are allowed to open NEW targets. Configurable & stored in
// market_alert_state["session_config"].regions. Empty/missing ⇒ all regions on.
async function getEnabledRegions(): Promise<Region[]> {
  const cfg = await getState("session_config");
  const r = cfg.regions as string[] | undefined;
  if (!Array.isArray(r) || r.length === 0) return [...ALL_REGIONS];
  const filtered = r.filter((x): x is Region => (ALL_REGIONS as string[]).includes(x));
  return filtered.length ? filtered : [...ALL_REGIONS];
}
async function setEnabledRegions(regions: string[]): Promise<Region[]> {
  const clean = [...new Set(regions)].filter((x): x is Region => (ALL_REGIONS as string[]).includes(x));
  const value = clean.length ? clean : [...ALL_REGIONS];
  await setState("session_config", { regions: value });
  return value;
}

function openSessions(d = new Date()): SessionDef[] {
  const h = d.getUTCHours();
  return SESSIONS.filter((s) => (s.start <= s.end ? h >= s.start && h < s.end : h >= s.start || h < s.end));
}
// A "major" session (London / New York) means high liquidity → good entry timing.
function isMajorSessionOpen(d = new Date()): boolean {
  return openSessions(d).some((s) => s.name === "London" || s.name === "New York");
}
// Is any ENABLED region currently open? (gates new targets per user config)
function enabledSessionOpen(enabled: Region[], d = new Date()): boolean {
  return openSessions(d).some((s) => enabled.includes(s.region));
}
// The active trading region — New York / London take priority (highest liquidity),
// else Asia. When `enabled` is given, only consider those regions.
function activeRegion(d = new Date(), enabled?: Region[]): Region | null {
  let open = openSessions(d);
  if (enabled) open = open.filter((s) => enabled.includes(s.region));
  if (open.length === 0) return null;
  if (open.some((s) => s.region === "New York")) return "New York";
  if (open.some((s) => s.region === "London")) return "London";
  return "Asia";
}
function sessionLabel(d = new Date(), enabled?: Region[]): string {
  const region = activeRegion(d, enabled);
  if (!region) return "Closed / داخراو";
  return `${REGION_EMOJI[region]} ${region} (${REGION_KU[region]})`;
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

// Build a short, plausible bilingual rationale from the available indicators
// (signal direction + size of the day's move). Kept concise for clean messaging.
function signalRationale(q: Quote, sig: "BUY" | "SELL"): { en: string; ku: string } {
  const move = Math.abs(q.changePct);
  const en: string[] = [];
  const ku: string[] = [];
  en.push(sig === "BUY" ? "EMA crossover up" : "EMA crossover down");
  ku.push(sig === "BUY" ? "EMA کراوسئۆڤەری سەرەوە" : "EMA کراوسئۆڤەری خوارەوە");
  en.push(sig === "BUY" ? "MACD bullish" : "MACD bearish");
  ku.push(sig === "BUY" ? "MACD بەهێز" : "MACD لاواز");
  if (move >= 0.6) { en.push("Strong momentum"); ku.push("جوڵەی بەهێز"); }
  else if (move < 0.4) { en.push("Low volatility risk"); ku.push("مەترسیی کەم"); }
  else { en.push("Steady trend"); ku.push("ترێندی ئارام"); }
  return { en: en.join(" + "), ku: ku.join(" + ") };
}

// Full BUY/SELL trade setup with entry, full target and stop loss (clean layout).
function newSignalLine(
  q: Quote, sig: "BUY" | "SELL", tp: number, sl: number, _tpPips: number, _slPips: number,
  confidence: number, session: string,
): string {
  const m = ASSET_META[q.symbol];
  const tpDelta = Math.abs(tp - q.price);
  const slDelta = Math.abs(sl - q.price);
  const r = signalRationale(q, sig);
  return [
    `${m.emoji} <b>${m.name} SIGNAL - ${sig}</b> ${sigEmoji(sig)}`,
    "",
    `💰 Entry: <code>$${fmt(q.price)}</code>`,
    `🎯 TP: <code>$${fmt(tp)}</code> (+$${fmt(tpDelta)})`,
    `🛑 SL: <code>$${fmt(sl)}</code> (-$${fmt(slDelta)})`,
    `⚡ Confidence: <b>${confidence}%</b>`,
    `📍 Session: ${session}`,
    "",
    `🇬🇧 Reason: ${esc(r.en)}`,
    "",
    `🇮🇶 هۆکار: ${esc(r.ku)}`,
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

// Standalone SIGNAL RESULT-only message (TP/SL outcomes only — no signals, no news).
function oneResultMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "🏁 <b>CTP SIGNAL RESULT</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
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

// Wrap a single trade target / outcome into its own standalone Telegram message.
// Each target is sent separately and never bundled with other targets or news.
function oneSignalMessage(subtitle: string, body: string, reason?: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP SIGNALS</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    reason ? `<i>ℹ️ ${subtitle} · ${reason}</i>` : `<i>ℹ️ ${subtitle}</i>`,
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

// Standalone CALENDAR-only message (economic events only — no signals, no news).
function oneCalendarMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "🗓 <b>CTP CALENDAR</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

// Standalone NEWS-only message (market news only — no signals, no calendar).
function oneNewsMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "📰 <b>CTP NEWS</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

// ───────────────────── core scan ─────────────────────
interface OpenSig { id?: string; signal: "BUY" | "SELL"; entry: number; tp: number; sl: number; }
// A single trade target message. `important` ⇒ broadcast immediately (bypass throttle).
// `reason` tells the user why this specific target was sent (very important, cooldown, news, etc.).
interface SignalMsg { text: string; important: boolean; reason: string; }

async function evaluatePrices(): Promise<{ signalAlerts: SignalMsg[]; outcomeAlerts: string[]; quotes: Quote[] }> {
  const quotes = await getPrices();
  const priceState = await getState("prices");      // { "XAU/USD": { price, signal } }
  const openState = await getState("open_signals"); // { "XAU/USD": OpenSig }
  const enabledRegions = await getEnabledRegions(); // which markets may open new targets
  const signalAlerts: SignalMsg[] = [];
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
      const prevOpen = priceState[q.symbol] as { lastSignalAt?: number } | undefined;
      priceState[q.symbol] = { price: q.price, signal: sig, lastSignalAt: prevOpen?.lastSignalAt };
      continue;
    }

    // 2) No open position → consider opening a NEW signal when timing is right.
    const prev = priceState[q.symbol] as { price?: number; signal?: Signal; lastSignalAt?: number } | undefined;
    const actionable = sig === "BUY" || sig === "SELL";
    // requireSession assets only open while an ENABLED region is live (user-configurable).
    const timingOk = !m.requireSession || enabledSessionOpen(enabledRegions);
    // Avoid re-opening the same direction immediately; only fire when signal flips.
    const fresh = prev?.signal !== sig;
    // Quiet-market guard: skip weak moves and respect a per-symbol cooldown so we
    // don't spam repeated signals when the market is barely moving.
    const strongMove = Math.abs(q.changePct) >= SIGNAL_MIN_MOVE_PCT;
    const cooldownOk = !prev?.lastSignalAt || Date.now() - prev.lastSignalAt >= SIGNAL_COOLDOWN_MS;

    let lastSignalAt = prev?.lastSignalAt;
    if (actionable && timingOk && fresh && strongMove && cooldownOk) {
      const isBuy = sig === "BUY";
      const tp = +(q.price * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
      const sl = +(q.price * (isBuy ? 1 - m.slPct / 100 : 1 + m.slPct / 100)).toFixed(2);
      const tpPips = toPips(tp - q.price, m.pip);
      const slPips = toPips(sl - q.price, m.pip);
      const confidence = Math.min(95, 60 + Math.round(Math.abs(q.changePct) * 10));
      const session = sessionLabel(new Date(), enabledRegions);

      const { data: ins } = await admin.from("ai_signals").insert({
        asset: m.name, signal: sig, entry: q.price, tp, sl,
        confidence, status: "open", market_session: session, tp_pips: tpPips, sl_pips: slPips,
      }).select("id").maybeSingle();

      const important = confidence >= TARGET_IMPORTANT_CONFIDENCE || Math.abs(q.changePct) >= TARGET_IMPORTANT_MOVE_PCT;
      const highConf = confidence >= TARGET_IMPORTANT_CONFIDENCE;
      const strongMove = Math.abs(q.changePct) >= TARGET_IMPORTANT_MOVE_PCT;
      let reason = "⏱ Cooldown passed / throttle finished · کاتژمێری کۆتایی هات";
      if (highConf && strongMove) reason = "🔥 Very important: high confidence + strong move · زۆر گرنگ: متمانە بەرز + جوڵە بەهێز";
      else if (highConf) reason = "🔥 Very important: high confidence · زۆر گرنگ: متمانە بەرز";
      else if (strongMove) reason = "🔥 Very important: strong move · زۆر گرنگ: جوڵە بەهێز";
      signalAlerts.push({ text: newSignalLine(q, sig as "BUY" | "SELL", tp, sl, tpPips, slPips, confidence, session), important, reason });
      openState[q.symbol] = { id: ins?.id as string | undefined, signal: sig as "BUY" | "SELL", entry: q.price, tp, sl };
      lastSignalAt = Date.now();
    }
    priceState[q.symbol] = { price: q.price, signal: sig, lastSignalAt };
  }


  await setState("prices", priceState);
  await setState("open_signals", openState);
  return { signalAlerts, outcomeAlerts, quotes };
}


// Detect the market-moving "tier-1" events that deserve a dedicated 🚨 alert.
function isFomcNfp(title: string): boolean {
  return /\bfomc\b|federal funds|fed funds|interest rate|rate decision|monetary policy|non[- ]?farm|\bnfp\b|payroll/i.test(title);
}
function specialEventHead(title: string): string {
  if (/non[- ]?farm|\bnfp\b|payroll/i.test(title)) return "🚨 <b>NFP RESULT</b>";
  if (/\bfomc\b|federal funds|fed funds|interest rate|rate decision|monetary policy/i.test(title)) return "🚨 <b>FOMC RESULT</b>";
  return "🚨 <b>HIGH-IMPACT RESULT</b>";
}

async function evaluateCalendar(): Promise<{ calendarAlerts: string[]; signalAlerts: SignalMsg[]; specialAlerts: string[] }> {
  const events = await getHighImpactEvents();
  const state = await getState("events"); // { alertedKeys, remindKeys, resultKeys, preGold }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const reminded = new Set((state.remindKeys as string[]) ?? []);
  const resulted = new Set((state.resultKeys as string[]) ?? []);
  const preGold: Record<string, number> = (state.preGold as Record<string, number>) ?? {};
  const now = Date.now();
  const calendarAlerts: string[] = [];     // pure news / heads-up / result info (NO trade targets)
  const signalAlerts: SignalMsg[] = [];    // news-driven trade targets (sent as separate messages)
  const specialAlerts: string[] = [];      // dedicated 🚨 FOMC/NFP result alerts
  let goldPrice: number | null = null; // fetched lazily for USD-event gold bias


  for (const ev of events) {
    // Persist upcoming events for the dashboard.
    await admin.from("economic_events").upsert({
      ext_key: ev.key, title: ev.title, currency: ev.currency, impact: ev.impact,
      event_time: new Date(ev.time).toISOString(), forecast: ev.forecast, previous: ev.previous,
    }, { onConflict: "ext_key" });

    const minutes = (ev.time - now) / 60_000;

    // 1) EARLY heads-up → fired once between the 5-min reminder window and EVENT_ALERT_MIN.
    if (minutes > EVENT_REMINDER_MIN && minutes <= EVENT_ALERT_MIN && !alerted.has(ev.key)) {
      alerted.add(ev.key);
      calendarAlerts.push([
        `🟠⚠️ <b>${esc(ev.title)}</b> (${esc(ev.currency)})`,
        `🕒 In ${Math.round(minutes)} min · لە ${Math.round(minutes)} خولەکدا`,
        ev.forecast ? `Forecast: <code>${esc(ev.forecast)}</code> · Prev: <code>${esc(ev.previous)}</code>` : "",
        `ئامادە بە — تارگێت دوای دەرچوونی هەواڵەکە دەنێردرێت`,
      ].filter(Boolean).join("\n"));
    }

    // 2) FINAL 5-minute reminder → fired once inside the last EVENT_REMINDER_MIN minutes.
    if (minutes >= 0 && minutes <= EVENT_REMINDER_MIN && !reminded.has(ev.key)) {
      reminded.add(ev.key);
      // Snapshot gold just before a tier-1 USD release so we can measure the reaction.
      if (isFomcNfp(ev.title) && ev.currency.toUpperCase() === "USD" && preGold[ev.key] == null) {
        if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
        if (goldPrice) preGold[ev.key] = goldPrice;
      }
      const left = Math.max(0, Math.round(minutes));
      calendarAlerts.push([
        `🔔⏰ <b>بیرهێنانەوە / REMINDER</b>`,
        `🟠 <b>${esc(ev.title)}</b> (${esc(ev.currency)})`,
        `🕒 ${left} min left · ${left} خولەک ماوە بۆ دەرچوونی هەواڵەکە`,
        ev.forecast ? `Forecast: <code>${esc(ev.forecast)}</code> · Prev: <code>${esc(ev.previous)}</code>` : "",
        `🟢🔴 ئامادە بە بۆ کڕین یان فرۆشتن / Get ready to BUY or SELL`,
      ].filter(Boolean).join("\n"));
    }



    // 2) AFTER the event releases → post the RESULT + market reaction/bias.
    // Only when an actual figure exists, event is in the past but recent (<=6h), and not yet posted.
    const minsSince = (now - ev.time) / 60_000;
    if (ev.actual && minsSince >= 0 && minsSince <= 360 && !resulted.has(ev.key)) {
      resulted.add(ev.key);

      // News block: result figures + market bias (no concrete Entry/TP/SL here).
      const lines: string[] = [
        `🏁 <b>RESULT / ئەنجامی هەواڵ</b>`,
        `📅 <b>${esc(ev.title)}</b> (${esc(ev.currency)})`,
        `Actual: <code>${esc(ev.actual)}</code> · Forecast: <code>${esc(ev.forecast || "—")}</code> · Prev: <code>${esc(ev.previous || "—")}</code>`,
      ];

      const a = parseFigure(ev.actual);
      const f = parseFigure(ev.forecast);
      const isUsd = ev.currency.toUpperCase() === "USD";

      if (isUsd && a !== null && f !== null) {
        const { dir, usd } = goldFromUsdSurprise(ev.title, a, f);
        if (dir === "HOLD") {
          lines.push(`⚪️ As expected / وەک پێشبینی — کاریگەری کەم لەسەر بازار`);
        } else {
          if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
          const usdTxt = usd === "stronger"
            ? `🔴 USD stronger / دۆلار بەهێزتر → Gold bearish / ئاڵتوون دادەبەزێت`
            : `🟢 USD weaker / دۆلار لاوازتر → Gold bullish / ئاڵتوون بەرز دەبێتەوە`;
          lines.push(usdTxt);
          lines.push(`🎯 تارگێتەکە بە پەیامێکی جیا دەنێردرێت / Trade target sent separately`);

          // Concrete trade target → SEPARATE signal message (news-driven ⇒ important).
          const m = ASSET_META["XAU/USD"];
          if (goldPrice) {
            const isBuy = dir === "BUY";
            const tp = +(goldPrice * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
            const sl = +(goldPrice * (isBuy ? 1 - m.slPct / 100 : 1 + m.slPct / 100)).toFixed(2);
            const tpPips = toPips(tp - goldPrice, m.pip);
            const slPips = toPips(sl - goldPrice, m.pip);
            signalAlerts.push({
              important: true,
              reason: "📰 High-impact news / هەواڵی کاریگەری بەرز",
              text: [
                `📰 News-driven / بەهۆی هەواڵ: <b>${esc(ev.title)}</b>`,
                `${sigBadge(dir)} <b>${dir} GOLD</b> / ${sigKu(dir)}ی ئاڵتوون`,
                `📍 Entry / دەستپێک: <code>$${fmt(goldPrice)}</code>`,
                `🎯🟢 TP / تارگێت: <code>$${fmt(tp)}</code> (${isBuy ? "+" : "-"}${tpPips} pips)`,
                `🛑🔴 SL / لۆست ستۆپ: <code>$${fmt(sl)}</code> (${isBuy ? "-" : "+"}${slPips} pips)`,
              ].join("\n"),
            });
          }
        }
      } else if (a !== null && f !== null) {
        const beat = a > f, miss = a < f;
        lines.push(beat ? `🟢 Beat forecast / باشتر لە پێشبینی` : miss ? `🔴 Below forecast / خراپتر لە پێشبینی` : `⚪️ As expected / وەک پێشبینی`);
      }

      // Dedicated 🚨 alert for tier-1 events (FOMC / NFP / rate decisions).
      if (isFomcNfp(ev.title)) {
        if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
        const pre = preGold[ev.key];
        const reaction = (goldPrice != null && pre != null) ? goldPrice - pre : null;
        const isNfp = /non[- ]?farm|\bnfp\b|payroll/i.test(ev.title);
        const sLines: string[] = [specialEventHead(ev.title)];
        if (isNfp) {
          sLines.push(`📊 Jobs: <b>${esc(ev.actual)}</b> (forecast ${esc(ev.forecast || "—")})`);
        } else {
          const held = !!ev.previous && !!ev.actual && ev.actual.trim() === ev.previous.trim();
          sLines.push(`🏦 Rate: <b>${held ? "Held" : "Changed"} ${esc(ev.actual)}</b> ${held ? "✓" : "❗"}`);
        }
        let goldDir: "BUY" | "SELL" | null = null;
        if (reaction != null) {
          const sign = reaction >= 0 ? "+" : "-";
          const arrow = reaction >= 0 ? "🟢▲" : "🔴▼";
          sLines.push(`🥇 Gold reaction: ${arrow} ${sign}$${fmt(Math.abs(reaction))} in ${Math.max(1, Math.round(minsSince))}min`);
          if (Math.abs(reaction) >= 1) goldDir = reaction > 0 ? "BUY" : "SELL";
        }
        if (!goldDir && a !== null && f !== null) {
          const sd = goldFromUsdSurprise(ev.title, a, f).dir;
          if (sd !== "HOLD") goldDir = sd;
        }
        if (goldDir && goldPrice) {
          const m = ASSET_META["XAU/USD"];
          const isBuy = goldDir === "BUY";
          const tp = +(goldPrice * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
          sLines.push(`📈 Signal: ${sigEmoji(goldDir)} <b>${goldDir}</b> → Target <code>$${fmt(tp)}</code>`);
          sLines.push(`📈 سیگنال: ${sigKu(goldDir)} → تارگێت <code>$${fmt(tp)}</code>`);
        } else {
          sLines.push(`⚪️ Muted reaction / کاریگەری کەم — چاوەڕێ بکە`);
        }
        delete preGold[ev.key];
        specialAlerts.push(sLines.join("\n"));
      }

      calendarAlerts.push(lines.join("\n"));
    }
  }

  // Keep last 100 keys of each kind (+ pending pre-event gold snapshots).
  await setState("events", {
    alertedKeys: [...alerted].slice(-100),
    remindKeys: [...reminded].slice(-100),
    resultKeys: [...resulted].slice(-100),
    preGold,
  });
  return { calendarAlerts, signalAlerts, specialAlerts };
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
  // Strip any leftover URLs and keep up to ~4 sentences (≤ 480 chars) so the
  // Telegram post can show the full news summary, not just a teaser.
  const clean = s.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  let out = sentences ? sentences.slice(0, 4).join(" ").trim() : clean;
  if (out.length > 480) out = out.slice(0, 477).trim() + "...";
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

// Asset / impact label maps for the bilingual news block.
const ASSET_LABEL: Record<string, { en: string; ku: string }> = {
  GOLD: { en: "Gold", ku: "زێڕ" },
  OIL: { en: "Oil", ku: "نەوت" },
  CRYPTO: { en: "BTC", ku: "بیتکۆین" },
  FOREX: { en: "USD", ku: "دۆلار" },
  MARKETS: { en: "Market", ku: "بازاڕ" },
};
const IMPACT_META: Record<string, { emoji: string; ku: string }> = {
  BULLISH: { emoji: "🟢", ku: "بەرزبوونەوە" },
  BEARISH: { emoji: "🔴", ku: "داکشان" },
  NEUTRAL: { emoji: "🟡", ku: "جێگیر" },
};
const URGENCY_META: Record<string, { emoji: string; en: string; ku: string }> = {
  BREAKING: { emoji: "🔴", en: "Breaking — act now", ku: "هەواڵی گرنگ — ئێستا کار بکە" },
  IMPORTANT: { emoji: "🟡", en: "Important — watch closely", ku: "گرنگ — بەوردی چاودێری بکە" },
  INFO: { emoji: "🟢", en: "Informational — no action needed", ku: "زانیاری — پێویست بە کار ناکات" },
};

type Impact = "BULLISH" | "BEARISH" | "NEUTRAL";
type Urgency = "BREAKING" | "IMPORTANT" | "INFO";
interface NewsEnrich {
  titleKu: string;
  summaryEn: string;
  summaryKu: string;
  impact: Impact;
  urgency: Urgency;
  tipEn: string;
  tipKu: string;
  relatedEn: string;
  relatedKu: string;
}

// Map a news category to the live symbol whose price anchors the trader tip.
const CAT_SYMBOL: Record<string, string> = {
  GOLD: "XAU/USD", OIL: "WTI/USD", CRYPTO: "BTC/USD", FOREX: "XAU/USD", MARKETS: "XAU/USD",
};

// Enrich a batch of news items in one AI call: natural-Kurdish title + summary,
// expected impact, urgency level, a trader tip with concrete levels, and a
// related-asset note. NO URLs / source names are ever produced.
async function enrichNews(items: NewsItem[], priceBySymbol: Record<string, number> = {}): Promise<NewsEnrich[]> {
  const fallback: NewsEnrich[] = items.map((n) => ({
    titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL",
    urgency: "INFO", tipEn: "", tipKu: "", relatedEn: "", relatedKu: "",
  }));
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || items.length === 0) return fallback;
  try {
    const payload = items.map((n) => {
      const al = ASSET_LABEL[n.category] ?? { en: "Market" };
      const sym = CAT_SYMBOL[n.category];
      const price = sym ? priceBySymbol[sym] : undefined;
      return {
        title: n.title,
        summary: n.summary,
        asset: al.en,
        current_price: price ?? null,
      };
    });
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an experienced bilingual financial journalist who writes for a Kurdish audience (English + Kurdish Sorani / کوردیی ناوەندی). " +
              "Write Kurdish the way a professional Kurdish news journalist would write it — natural, fluent and idiomatic. Do NOT translate word-for-word; rephrase so it reads like original Kurdish journalism, while keeping the meaning faithful. Keep financial terms understandable. " +
              "For each item return an object with EXACTLY these keys: " +
              "title_ku (a natural Kurdish news-style title), " +
              "summary_en (a clear 3-4 sentence English summary built from the title and provided text; NEVER include URLs, links, or source/website names), " +
              "summary_ku (a natural, journalist-style Kurdish version of summary_en — fluent, not literal), " +
              "impact (one of BULLISH, BEARISH, NEUTRAL — expected effect on the given asset), " +
              "urgency (one of BREAKING, IMPORTANT, INFO — how time-sensitive this news is for a trader), " +
              "tip_en (one short actionable trader tip with concrete price levels using current_price when provided, e.g. 'If gold is bullish, consider BUY above 4320 with SL 4305'), " +
              "tip_ku (the same trader tip written naturally in Kurdish Sorani), " +
              "related_en (one short sentence naming another asset also affected and why, e.g. 'Oil also affected because the Iran deal impacts both'; empty string if none), " +
              "related_ku (the same related-asset note in natural Kurdish; empty string if none). " +
              "Reply ONLY with a JSON array of objects, same order and same length as the input. No markdown, no extra text.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) { await res.text(); return fallback; }
    const d = await res.json();
    let content = String(d?.choices?.[0]?.message?.content ?? "").trim();
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const arr = JSON.parse(content);
    if (Array.isArray(arr) && arr.length === items.length) {
      return arr.map((x, i) => {
        const impRaw = String(x?.impact ?? "").toUpperCase();
        const impact: Impact = impRaw === "BULLISH" || impRaw === "BEARISH" ? impRaw : "NEUTRAL";
        const urgRaw = String(x?.urgency ?? "").toUpperCase();
        const urgency: Urgency = urgRaw === "BREAKING" || urgRaw === "IMPORTANT" ? urgRaw : "INFO";
        return {
          titleKu: String(x?.title_ku ?? ""),
          summaryEn: String(x?.summary_en ?? items[i].summary ?? ""),
          summaryKu: String(x?.summary_ku ?? ""),
          impact,
          urgency,
          tipEn: String(x?.tip_en ?? ""),
          tipKu: String(x?.tip_ku ?? ""),
          relatedEn: String(x?.related_en ?? ""),
          relatedKu: String(x?.related_ku ?? ""),
        };
      });
    }
  } catch (e) {
    console.error("enrichNews failed", e);
  }
  return fallback;
}

const CAT_EMOJI: Record<string, string> = { GOLD: "🟡", OIL: "🟠", CRYPTO: "🟣", FOREX: "🔵", MARKETS: "🟢" };

// Build one bilingual news block — NO external links / sources.
function newsBlockItem(n: NewsItem, e: NewsEnrich): string {
  const dot = CAT_EMOJI[n.category] ?? "🔹";
  const al = ASSET_LABEL[n.category] ?? { en: n.category, ku: n.category };
  const im = IMPACT_META[e.impact] ?? IMPACT_META.NEUTRAL;
  const ur = URGENCY_META[e.urgency] ?? URGENCY_META.INFO;
  const summaryEn = (e.summaryEn || n.summary || "").trim();
  const parts: string[] = [
    `${ur.emoji} <b>${esc(ur.en)} / ${esc(ur.ku)}</b>`,
    "",
    `${dot} <b>${esc(n.category)}</b>`,
  ];
  if (e.titleKu) parts.push(esc(e.titleKu));
  if (summaryEn) parts.push("", "📝 <b>English:</b>", esc(summaryEn));
  if (e.summaryKu) parts.push("", "📝 <b>کوردی:</b>", esc(e.summaryKu));
  parts.push(
    "",
    `🎯 ${esc(al.en)} Impact: ${e.impact} ${im.emoji}`,
    `کاریگەری بۆ ${esc(al.ku)}: ${im.ku}`,
  );
  if (e.tipEn || e.tipKu) {
    parts.push("", "💡 <b>Trader Tip / تێبینی بۆ ترەیدەر:</b>");
    if (e.tipEn) parts.push(esc(e.tipEn));
    if (e.tipKu) parts.push(esc(e.tipKu));
  }
  if (e.relatedEn || e.relatedKu) {
    parts.push("", "🔗 <b>Related / پەیوەندیدار:</b>");
    if (e.relatedEn) parts.push(esc(e.relatedEn));
    if (e.relatedKu) parts.push(esc(e.relatedKu));
  }
  return parts.join("\n");
}

interface NewsOut { block: string; headline: string; hash: string }

async function evaluateNews(quotes: Quote[] = []): Promise<NewsOut[]> {
  const priceBySymbol: Record<string, number> = {};
  for (const q of quotes) priceBySymbol[q.symbol] = q.price;
  const news = await fetchNews();
  const state = await getState("news"); // { alertedKeys: string[] }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const now = Date.now();

  // Pick up to 4 new, fresh (≤90 min old) items we have not alerted yet, AND
  // whose exact headline was NOT already posted in the last 2 hours (DB-backed
  // dedupe — the single source of truth that stops duplicate news).
  const fresh: NewsItem[] = [];
  for (const n of news) {
    const key = (n.link || n.title).toLowerCase();
    if (alerted.has(key)) continue;
    alerted.add(key);
    const ts = Date.parse(n.pubDate) || 0;
    if (ts && now - ts > 90 * 60 * 1000) continue;
    // Skip if this EXACT headline was already sent in the last 2 hours.
    const headlineHash = contentHash(n.title);
    if (await wasRecentlySent(headlineHash, NEWS_DEDUPE_MS)) continue;
    fresh.push(n);
    if (fresh.length >= 4) break;
  }
  await setState("news", { alertedKeys: [...alerted].slice(-300) });
  if (fresh.length === 0) return [];

  const enriched = await enrichNews(fresh, priceBySymbol);

  // Persist for the dashboard (best-effort).
  const out: NewsOut[] = [];
  for (let i = 0; i < fresh.length; i++) {
    const n = fresh[i];
    const e = enriched[i] ?? { titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL" as Impact, urgency: "INFO" as Urgency, tipEn: "", tipKu: "", relatedEn: "", relatedKu: "" };
    const hash = (n.link || n.title).toLowerCase();
    await admin.from("market_news").upsert({
      hash, title: n.title, title_ku: e.titleKu || null, summary: e.summaryEn || n.summary || null,
      impact: n.category, bias: e.impact, source: n.source, url: n.link,
      published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
    }, { onConflict: "hash" });
    out.push({ block: newsBlockItem(n, e), headline: n.title, hash: contentHash(n.title) });
  }
  return out;
}

// ───────────────────── market-open report (per region) ─────────────────────
// Build an analysis card for a region that just opened: live prices, per-asset
// signal, overall bias, and a "get ready to BUY/SELL" heads-up. No concrete
// target here — targets are sent separately when the buy/sell moment arrives.
function sessionOpenReport(region: Region, quotes: Quote[]): string {
  const label = `${REGION_EMOJI[region]} ${region} (${REGION_KU[region]})`;
  const sigs = quotes.map((q) => ruleSignal(q.changePct));
  const buys = sigs.filter((s) => s === "BUY").length;
  const sells = sigs.filter((s) => s === "SELL").length;
  let bias = "🟡 Neutral / مامناوەند — چاوەڕێی جوڵە بکە";
  if (buys > sells) bias = "🟢 Bullish bias / مەیلی کڕین — ئامادە بە بۆ BUY";
  else if (sells > buys) bias = "🔴 Bearish bias / مەیلی فرۆشتن — ئامادە بە بۆ SELL";
  const priceBlock = quotes.length
    ? quotes.map((q) => priceLine(q, ruleSignal(q.changePct))).join("\n\n")
    : "—";
  return [
    "🔔 <b>MARKET OPEN / بازاڕ کرایەوە</b>",
    `🏙 Session / بازاڕ: ${label}`,
    "━━━━━━━━━━━━━━━",
    "",
    "📈 <b>Analysis / شیکاری بازاڕ</b>",
    "",
    priceBlock,
    "",
    `📊 Overall bias / مەیلی گشتی: ${bias}`,
    "",
    "🟢🔴 ئامادە بە بۆ کڕین یان فرۆشتن — کاتێک وەختی هات تارگێت بە پەیامێکی جیا دەنێردرێت",
    "Get ready to BUY/SELL — targets are sent separately when the moment arrives",
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

// Detect regions that JUST opened (only ENABLED ones) and emit one report each.
// State stores the set of currently-open regions so each region only reports once
// per open; when it closes it is removed and can report again on its next open.
async function evaluateSessionOpen(): Promise<string[]> {
  const enabled = await getEnabledRegions();
  const openRegions = [...new Set(openSessions().map((s) => s.region))].filter((r) => enabled.includes(r));
  const state = await getState("session_open");
  const reported = new Set((state.reported as string[]) ?? []);
  const newlyOpen = openRegions.filter((r) => !reported.has(r));

  const alerts: string[] = [];
  if (newlyOpen.length) {
    const quotes = await getPrices();
    for (const region of newlyOpen) alerts.push(sessionOpenReport(region as Region, quotes));
  }
  // Persist only the regions still open so closed ones can re-trigger later.
  await setState("session_open", { reported: openRegions });
  return alerts;
}

// ───────────────────── scheduled session OPEN / CLOSE posts ─────────────────────
// Auto-posts a rich bilingual card to @goldmarketai exactly when each major FX
// session opens and closes (UTC triggers). Deduped per day via session_posts_log.
const SESSION_OPEN_HOURS: Record<Region, number> = { Asia: 0, London: 7, "New York": 13 };
const SESSION_CLOSE_HOURS: Record<Region, number> = { Asia: 8, London: 16, "New York": 21 };

// London-clock label for the current time (handles BST/GMT automatically).
function londonHourLabel(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
}

// Lookup quotes by base asset.
function q3(quotes: Quote[]): { gold?: Quote; oil?: Quote; btc?: Quote } {
  return {
    gold: quotes.find((q) => q.symbol === "XAU/USD"),
    oil: quotes.find((q) => q.symbol === "WTI/USD"),
    btc: quotes.find((q) => q.symbol === "BTC/USD"),
  };
}

// BULLISH / BEARISH / NEUTRAL bias from the day's % change.
function biasLabel(changePct: number): string {
  if (changePct >= 0.15) return "BULLISH 🟢";
  if (changePct <= -0.15) return "BEARISH 🔴";
  return "NEUTRAL 🟡";
}

// Plain price line: "🥇 Gold: $4,275.30"
function plainPriceLine(q: Quote | undefined, emoji: string, name: string): string {
  if (!q) return `${emoji} ${name}: —`;
  return `${emoji} ${name}: <code>$${fmt(q.price)}</code>`;
}

// Price line with arrow + %: "🥇 Gold: $4,275.30 🟢▲ +0.42%"
function priceWithChangeLine(q: Quote | undefined, emoji: string, name: string): string {
  if (!q) return `${emoji} ${name}: —`;
  const up = q.changePct >= 0;
  const arrow = up ? "🟢▲" : "🔴▼";
  return `${emoji} ${name}: <code>$${fmt(q.price)}</code> ${arrow} ${up ? "+" : ""}${q.changePct.toFixed(2)}%`;
}

// Today's high-impact economic events, optionally only USD and/or only upcoming.
async function todaysKeyEvents(opts?: { usdOnly?: boolean; futureOnly?: boolean }): Promise<string[]> {
  const events = await getHighImpactEvents();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const rows = events
    .filter((e) => new Date(e.time).toISOString().slice(0, 10) === today)
    .filter((e) => (opts?.usdOnly ? /USD/i.test(e.currency) : true))
    .filter((e) => (opts?.futureOnly ? e.time >= now : true))
    .sort((a, b) => a.time - b.time)
    .slice(0, 6);
  return rows.map((e) => {
    const t = new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    return `• ${t} UTC · ${esc(e.currency)} ${esc(e.title)}`;
  });
}

// ── session open price snapshot (for close-session % change) ──
async function recordSessionOpenPrices(region: Region, day: string, quotes: Quote[]) {
  const state = await getState("session_open_prices");
  const map = (state.map as Record<string, Record<string, number>>) ?? {};
  const snap: Record<string, number> = {};
  for (const q of quotes) snap[q.symbol] = q.price;
  map[`${region}|${day}`] = snap;
  await setState("session_open_prices", { map });
}
async function getSessionOpenPrices(region: Region, day: string): Promise<Record<string, number> | null> {
  const state = await getState("session_open_prices");
  const map = (state.map as Record<string, Record<string, number>>) ?? {};
  return map[`${region}|${day}`] ?? null;
}

// Session change line (open → close): "🥇 Gold: 🟢 +$5.20 (+0.12%)"
function sessionChangeLine(q: Quote | undefined, emoji: string, name: string, openPrice?: number): string {
  if (!q) return `${emoji} ${name}: —`;
  let delta: number;
  let pct: number;
  if (openPrice && openPrice > 0) {
    delta = q.price - openPrice;
    pct = (delta / openPrice) * 100;
  } else {
    pct = q.changePct;
    delta = q.price * (pct / 100);
  }
  const sign = delta >= 0 ? "+" : "-";
  const dot = delta >= 0 ? "🟢" : "🔴";
  return `${emoji} ${name}: ${dot} ${sign}$${fmt(Math.abs(delta))} (${sign}${Math.abs(pct).toFixed(2)}%)`;
}

// Count this region's signals today (total / won / lost) from ai_signals.
async function sessionSignalStats(region: Region, day: string): Promise<{ total: number; won: number; lost: number }> {
  const startUtc = new Date(`${day}T00:00:00.000Z`).toISOString();
  const { data } = await admin.from("ai_signals")
    .select("status, market_session, created_at")
    .gte("created_at", startUtc);
  const rows = (data ?? []) as { status: string; market_session: string }[];
  const mine = rows.filter((r) => rowRegion(r.market_session) === region);
  return {
    total: mine.length,
    won: mine.filter((r) => r.status === "target_hit").length,
    lost: mine.filter((r) => r.status === "stopped_out").length,
  };
}

// ── OPEN message builder ──
async function sessionOpenMessage(region: Region, quotes: Quote[], now: Date): Promise<string> {
  const { gold, oil, btc } = q3(quotes);
  const utcLabel = `${String(SESSION_OPEN_HOURS[region]).padStart(2, "0")}:00`;
  const lonLabel = londonHourLabel(now);
  const lines: string[] = [
    "━━━━━━━━━━━━━━━",
    `${REGION_EMOJI[region]} <b>${REGION_KU[region]} کرایەوە</b>`,
    `${REGION_EMOJI[region]} <b>${region} Session Open</b>`,
    "━━━━━━━━━━━━━━━",
    `🕐 ${utcLabel} UTC | ${lonLabel} London`,
  ];

  if (region === "Asia") {
    lines.push("📊 Markets now active: JPY, AUD, NZD", "");
    lines.push(plainPriceLine(gold, "🥇", "Gold"), plainPriceLine(oil, "🛢", "Oil"), plainPriceLine(btc, "₿", "BTC"), "");
    lines.push("📈 <b>Bias / ئاراستەی بازاڕ:</b>");
    lines.push(`🥇 Gold: ${gold ? biasLabel(gold.changePct) : "—"}`);
    lines.push(`🛢 Oil: ${oil ? biasLabel(oil.changePct) : "—"}`);
    lines.push(`₿ BTC: ${btc ? biasLabel(btc.changePct) : "—"}`, "");
    lines.push("⚡ First Signal Expected:", "Within 30 minutes of open");
  } else if (region === "London") {
    lines.push("📊 High volatility expected!", "جووڵانی بەهێز چاوەڕوانە!", "");
    lines.push(priceWithChangeLine(gold, "🥇", "Gold"), priceWithChangeLine(oil, "🛢", "Oil"), priceWithChangeLine(btc, "₿", "BTC"), "");
    const buys = quotes.filter((q) => ruleSignal(q.changePct) === "BUY").length;
    const sells = quotes.filter((q) => ruleSignal(q.changePct) === "SELL").length;
    const outlook = buys > sells ? "🟢 Bullish — مەیلی کڕین" : sells > buys ? "🔴 Bearish — مەیلی فرۆشتن" : "🟡 Neutral — مامناوەند";
    lines.push("📈 <b>Session Outlook / دیدی سێشن:</b>", outlook, "");
    const ev = await todaysKeyEvents();
    lines.push("🗓 <b>Key Events Today:</b>", ev.length ? ev.join("\n") : "• No high-impact events", "");
    lines.push("⚡ Bot Status: ACTIVE - watching for signals", "بۆت چالاکە - لە دوای سیگناڵدا دەگەڕێت");
  } else {
    lines.push("📊 USD pairs most active now!", "");
    lines.push(plainPriceLine(gold, "🥇", "Gold"), plainPriceLine(oil, "🛢", "Oil"), plainPriceLine(btc, "₿", "BTC"), "");
    const ev = await todaysKeyEvents({ usdOnly: true, futureOnly: true });
    lines.push("🗓 <b>US Events Today:</b>", ev.length ? ev.join("\n") : "• No USD events remaining", "");
    lines.push("⚡ Bot Status: ACTIVE");
  }

  lines.push("━━━━━━━━━━━━━━━", "<i>ئەمە ڕاوێژی دارایی نییە</i>");
  return lines.join("\n");
}

// ── CLOSE message builder ──
async function sessionCloseMessage(region: Region, quotes: Quote[], day: string): Promise<string> {
  const { gold, oil, btc } = q3(quotes);
  const open = await getSessionOpenPrices(region, day);
  const stats = await sessionSignalStats(region, day);
  const lines: string[] = [
    "━━━━━━━━━━━━━━━",
    `${REGION_EMOJI[region]} <b>${REGION_KU[region]} داخرا</b>`,
    `${REGION_EMOJI[region]} <b>${region} Session Closed</b>`,
    "━━━━━━━━━━━━━━━",
    `📊 <b>${region} Summary / پوختەی ${REGION_KU[region]}:</b>`,
    sessionChangeLine(gold, "🥇", "Gold", open?.["XAU/USD"]),
    sessionChangeLine(oil, "🛢", "Oil", open?.["WTI/USD"]),
    sessionChangeLine(btc, "₿", "BTC", open?.["BTC/USD"]),
    "",
    `✅ Signals this session: ${stats.total}`,
    `🏆 Won: ${stats.won} | ❌ Lost: ${stats.lost}`,
  ];
  if (region === "New York") {
    lines.push("", "⏭ Next: Daily Report at 22:00 BST");
  }
  lines.push("━━━━━━━━━━━━━━━", "<i>ئەمە ڕاوێژی دارایی نییە</i>");
  return lines.join("\n");
}

// Dedup helpers against session_posts_log.
async function wasSessionPosted(region: Region, kind: "open" | "close", day: string): Promise<boolean> {
  const { data } = await admin.from("session_posts_log")
    .select("id").eq("region", region).eq("kind", kind).eq("session_date", day).limit(1).maybeSingle();
  return !!data;
}
async function recordSessionPost(region: Region, kind: "open" | "close", day: string) {
  await admin.from("session_posts_log").insert({ region, kind, session_date: day });
}

interface SessionPost { region: Region; kind: "open" | "close"; text: string; }

// Fire any session open/close posts due in the current UTC hour (deduped per day).
async function evaluateSessionPosts(): Promise<SessionPost[]> {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.toISOString().slice(0, 10);
  const out: SessionPost[] = [];
  let quotes: Quote[] | null = null;
  const getQ = async (): Promise<Quote[]> => (quotes ??= await getPrices());

  for (const region of ALL_REGIONS) {
    if (SESSION_OPEN_HOURS[region] === hour && !(await wasSessionPosted(region, "open", day))) {
      const q = await getQ();
      await recordSessionOpenPrices(region, day, q);
      out.push({ region, kind: "open", text: await sessionOpenMessage(region, q, now) });
    }
  }
  for (const region of ALL_REGIONS) {
    if (SESSION_CLOSE_HOURS[region] === hour && !(await wasSessionPosted(region, "close", day))) {
      const q = await getQ();
      out.push({ region, kind: "close", text: await sessionCloseMessage(region, q, day) });
    }
  }
  return out;
}

// ───────────────────── daily summary (22:00 BST = 21:00 UTC) ─────────────────────
const DAILY_SUMMARY_UTC_HOUR = 21; // 22:00 London time (BST)



// Convert pips → an approximate dollar P/L (0.01-lot convention: $0.10 per pip).
function pipsToDollars(pips: number): number {
  return pips * 0.1;
}
function plStr(dollars: number): string {
  return `${dollars >= 0 ? "+" : "-"}$${fmt(Math.abs(dollars))}`;
}
function pipsStr(pips: number): string {
  return `${pips >= 0 ? "+" : ""}${Math.round(pips)}`;
}

interface DailyRow {
  asset: string;
  signal: string;
  entry: number;
  close_price: number;
  status: string;
  result_pips: number;
  market_session: string;
}

// Which region a stored session label belongs to.
function rowRegion(label: string): Region | null {
  if (!label) return null;
  if (label.includes("New York")) return "New York";
  if (label.includes("London")) return "London";
  if (label.includes("Asia")) return "Asia";
  return null;
}

// Pips for a row: prefer the stored result_pips, else derive from entry/close.
function rowPips(r: DailyRow): number {
  if (Number.isFinite(r.result_pips) && r.result_pips !== 0) return Number(r.result_pips);
  const meta = ASSET_META[r.asset];
  const pip = meta?.pip ?? 0.1;
  const entry = Number(r.entry) || 0;
  const close = Number(r.close_price) || 0;
  if (!entry || !close) return 0;
  const diff = r.signal === "SELL" ? entry - close : close - entry;
  return toPips(diff, pip);
}

function sessionRegionBlock(region: Region, rows: DailyRow[]): string {
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const pips = rows.reduce((s, r) => s + rowPips(r), 0);
  const pl = pipsToDollars(pips);
  const plDot = pl >= 0 ? "🟢" : "🔴";
  return [
    `${REGION_EMOJI[region]} <b>${region.toUpperCase()} SESSION</b>`,
    `✅ Won: ${won}  ❌ Lost: ${lost}`,
    `📈 Pips: ${pipsStr(pips)}  💰 P/L: ${plDot} ${plStr(pl)}`,
  ].join("\n");
}

// End-of-day report with per-session breakdown, win-rates, and best/worst signal.
// Fires once per day during the 21:00 UTC (22:00 BST) hour; deduped by calendar date.
// Pass { force: true } to build the report regardless of the time/dedupe gates
// (used by the preview/test handler — does not touch the dedupe state).
async function evaluateDailySummary(_quotes: Quote[], opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (!opts?.force) {
    if (now.getUTCHours() !== DAILY_SUMMARY_UTC_HOUR) return null;
    const state = await getState("daily_summary");
    if (state.lastDay === day) return null;
    await setState("daily_summary", { lastDay: day });
  }


  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "Europe/London",
  });

  const header = [
    "━━━━━━━━━━━━━━━━━━━━━",
    "📊 <b>CTP DAILY REPORT</b>",
    "<i>یەکەمین پلاتفۆرمی ترەیدینگی کوردی</i>",
    "━━━━━━━━━━━━━━━━━━━━━",
    `📅 ${esc(dateLabel)}`,
    "",
  ];
  const footer = [
    "━━━━━━━━━━━━━━━━━━━━━",
    "📱 <b>بچۆ بۆ چەنالەکە</b>",
    "https://t.me/goldmarketai",
    "━━━━━━━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  // Today's closed signals (target_hit / stopped_out).
  const startUtc = new Date(`${day}T00:00:00.000Z`).toISOString();
  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as DailyRow[];

  // No signals today → still send a summary.
  if (rows.length === 0) {
    return [
      ...header,
      "😴 <b>No signals generated today</b>",
      "<i>هیچ سیگناڵێک ئەمڕۆ نەنێردرا</i>",
      "",
      ...footer,
    ].join("\n");
  }

  // Group by region.
  const byRegion: Record<Region, DailyRow[]> = { Asia: [], London: [], "New York": [] };
  for (const r of rows) {
    const reg = rowRegion(r.market_session);
    if (reg) byRegion[reg].push(r);
  }

  // Totals.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  // Best winning signal & worst losing signal.
  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const losers = rows.filter((r) => r.status === "stopped_out").sort((a, b) => rowPips(a) - rowPips(b));
  const best = winners[0];
  const worst = losers[0];

  const sigText = (r: DailyRow) => {
    const meta = ASSET_META[r.asset] ?? { emoji: "🥇", name: r.asset };
    const entry = Number(r.entry) || 0;
    const close = Number(r.close_price) || 0;
    const delta = r.signal === "SELL" ? entry - close : close - entry;
    return { meta, entry, close, delta };
  };

  const lines: string[] = [
    ...header,
    "🌍 <b>SESSION BREAKDOWN:</b>",
    "<i>سەرکەوتنی هەر سێشنێک</i>",
    "",
    sessionRegionBlock("Asia", byRegion.Asia),
    "",
    sessionRegionBlock("London", byRegion.London),
    "",
    sessionRegionBlock("New York", byRegion["New York"]),
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "📊 <b>TOTAL TODAY</b>",
    "━━━━━━━━━━━━━━━━━━━━━",
    `🥇 Signals: <b>${trades}</b> total`,
    `✅ Won: <b>${won}</b> (${winRate}% win rate)`,
    `❌ Lost: <b>${lost}</b>`,
    `📈 Total Pips: <b>${pipsStr(totalPips)}</b>`,
    `💰 Net P/L: ${netDot} <b>${plStr(netPl)}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
  ];

  if (best) {
    const b = sigText(best);
    lines.push(
      "🏆 <b>BEST SIGNAL TODAY</b>",
      `${b.meta.emoji} ${b.meta.name} ${best.signal} @ <code>$${fmt(b.entry)}</code>`,
      `✅ Hit TP: <code>$${fmt(b.close)}</code> (${b.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(b.delta))})`,
      `📈 ${pipsStr(rowPips(best))} pips`,
      "",
    );
  }
  if (worst) {
    const w = sigText(worst);
    lines.push(
      "❌ <b>MISSED SIGNAL</b>",
      `${w.meta.emoji} ${w.meta.name} ${worst.signal} @ <code>$${fmt(w.entry)}</code>`,
      `🛑 Hit SL: <code>$${fmt(w.close)}</code> (${w.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(w.delta))})`,
      `📉 ${pipsStr(rowPips(worst))} pips`,
      "",
    );
  }

  lines.push(...footer);
  return lines.join("\n");
}



// ───────────────────── weekly report (Monday 08:00 BST) ─────────────────────
// Summarizes the previous trading week (Mon–Fri that just ended): gold range,
// bot performance, and best/worst signal. Deduped per week via market_alert_state.
async function evaluateWeeklySummary(opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  // London-clock weekday + hour (handles BST/GMT automatically).
  const lon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const weekKey = (() => {
    // ISO-ish key of THIS Monday (London) so we only post once per week.
    const d = new Date(lon);
    const diff = (d.getDay() + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();

  if (!opts?.force) {
    if (lon.getDay() !== 1 || lon.getHours() !== 8) return null; // Monday 08:00 BST/GMT
    const state = await getState("weekly_summary");
    if (state.lastWeek === weekKey) return null;
    await setState("weekly_summary", { lastWeek: weekKey });
  }

  // Previous week window: last Monday 00:00 → this Monday 00:00 (UTC dates).
  const todayUtc = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const dow = (todayUtc.getUTCDay() + 6) % 7; // days since Monday (UTC)
  const thisMonday = new Date(todayUtc);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - dow);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const startUtc = prevMonday.toISOString();
  const endUtc = thisMonday.toISOString();
  const prevFriday = new Date(prevMonday);
  prevFriday.setUTCDate(prevFriday.getUTCDate() + 4);

  const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const yearLabel = prevFriday.getUTCFullYear();
  const weekLabel = `${fmtDay(prevMonday)}-${prevFriday.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}, ${yearLabel}`;

  const header = [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP WEEKLY REPORT</b>",
    "<i>هەفتەنامەی CTP</i>",
    "━━━━━━━━━━━━━━━",
    `📅 Week: ${weekLabel}`,
    "",
  ];
  const footer = [
    "📱 t.me/goldmarketai",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .lt("closed_at", endUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as DailyRow[];

  if (rows.length === 0) {
    return [
      ...header,
      "😴 <b>No signals closed last week</b>",
      "<i>هیچ سیگناڵێک هەفتەی ڕابردوو نەهاتە تەواوبوون</i>",
      "",
      ...footer,
    ].join("\n");
  }

  // Gold performance from this week's gold signal price points.
  const goldRows = rows.filter((r) => r.asset === "XAU/USD");
  const goldPrices = goldRows.flatMap((r) => [Number(r.entry), Number(r.close_price)]).filter((n) => Number.isFinite(n) && n > 0);
  let goldBlock: string[] = [];
  if (goldPrices.length) {
    const high = Math.max(...goldPrices);
    const low = Math.min(...goldPrices);
    const first = Number(goldRows[0]?.entry) || goldPrices[0];
    const last = Number(goldRows[goldRows.length - 1]?.close_price) || goldPrices[goldPrices.length - 1];
    const chg = last - first;
    const chgPct = first ? (chg / first) * 100 : 0;
    const sign = chg >= 0 ? "+" : "-";
    goldBlock = [
      "🥇 <b>GOLD PERFORMANCE:</b>",
      `High: <code>$${fmt(high)}</code> | Low: <code>$${fmt(low)}</code>`,
      `Weekly Change: ${sign}$${fmt(Math.abs(chg))} (${sign}${Math.abs(chgPct).toFixed(2)}%)`,
      "",
    ];
  }

  // Bot performance totals.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const losers = rows.filter((r) => r.status === "stopped_out").sort((a, b) => rowPips(a) - rowPips(b));
  const best = winners[0];
  const worst = losers[0];
  const sigText = (r: DailyRow) => {
    const meta = ASSET_META[r.asset] ?? { emoji: "🥇", name: r.asset };
    const entry = Number(r.entry) || 0;
    const close = Number(r.close_price) || 0;
    const delta = r.signal === "SELL" ? entry - close : close - entry;
    return { meta, entry, close, delta };
  };

  const lines: string[] = [
    ...header,
    ...goldBlock,
    "📊 <b>BOT PERFORMANCE:</b>",
    `Total Signals: ${trades}`,
    `✅ Won: ${won} (${winRate}% win rate)`,
    `❌ Lost: ${lost}`,
    `💰 Total Pips: ${pipsStr(totalPips)}`,
    `💵 Net P/L: ${netDot} ${plStr(netPl)}`,
    "",
  ];

  if (best) {
    const b = sigText(best);
    lines.push(
      "🏆 <b>Best Signal of Week:</b>",
      `${b.meta.emoji} ${b.meta.name} ${best.signal} @ <code>$${fmt(b.entry)}</code> → <code>$${fmt(b.close)}</code>`,
      `${b.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(b.delta))} | ${pipsStr(rowPips(best))} pips ✅`,
      "",
    );
  }
  if (worst) {
    const w = sigText(worst);
    lines.push(
      "❌ <b>Worst Signal:</b>",
      `${w.meta.emoji} ${w.meta.name} ${worst.signal} @ <code>$${fmt(w.entry)}</code> → SL <code>$${fmt(w.close)}</code>`,
      `${w.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(w.delta))} | ${pipsStr(rowPips(worst))} pips`,
      "",
    );
  }

  lines.push(...footer);
  return lines.join("\n");
}

// ───────────────────── monthly report (1st of month 09:00 BST) ─────────────────────
// Summarizes the previous calendar month: gold range, bot performance, best week,
// signal of the month, and the next month's key events. Deduped per month via
// market_alert_state["monthly_summary"].monthKey.
async function evaluateMonthlySummary(opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  const lon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  // Key of the month we are reporting ON (the previous calendar month).
  const monthKey = (() => {
    const y = lon.getFullYear();
    const m = lon.getMonth(); // 0-based current month
    const prev = new Date(Date.UTC(y, m - 1, 1));
    return prev.toISOString().slice(0, 7); // YYYY-MM of previous month
  })();

  if (!opts?.force) {
    // Fire on the 1st of the month at 09:00 London time.
    if (lon.getDate() !== 1 || lon.getHours() !== 9) return null;
    const state = await getState("monthly_summary");
    if (state.lastMonth === monthKey) return null;
    await setState("monthly_summary", { lastMonth: monthKey });
  }

  // Previous calendar month window (UTC): [firstOfPrev, firstOfThis).
  const todayUtc = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const firstOfThis = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
  const firstOfPrev = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, 1));
  const startUtc = firstOfPrev.toISOString();
  const endUtc = firstOfThis.toISOString();
  const monthLabel = firstOfPrev.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const nextMonthLabel = firstOfThis.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const header = [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP MONTHLY REPORT</b>",
    "<i>ڕاپۆرتی مانگانەی CTP</i>",
    "━━━━━━━━━━━━━━━",
    `📅 ${monthLabel} Summary`,
    "",
  ];
  const footer = [
    "📱 t.me/goldmarketai",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  // Build the "Next Month Outlook" from upcoming high-impact events regardless of
  // whether any signals closed last month.
  const outlookBlock = await (async (): Promise<string[]> => {
    const { data: ev } = await admin.from("economic_events")
      .select("title, currency, impact, event_time")
      .gte("event_time", endUtc)
      .lt("event_time", new Date(Date.UTC(firstOfThis.getUTCFullYear(), firstOfThis.getUTCMonth() + 1, 1)).toISOString())
      .order("event_time", { ascending: true });
    const highImpact = (ev ?? []).filter((e) =>
      String(e.impact ?? "").toLowerCase().includes("high") || String(e.impact ?? "") === "3");
    const picks = (highImpact.length ? highImpact : (ev ?? [])).slice(0, 4);
    const block: string[] = ["📊 <b>Next Month Outlook:</b>", `<i>ئاراستەی ${nextMonthLabel}</i>`];
    if (picks.length) {
      for (const e of picks) {
        const d = new Date(e.event_time as string);
        const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        block.push(`• ${day} — ${esc(String(e.title))} (${esc(String(e.currency))})`);
      }
    } else {
      block.push("• Watch FOMC, NFP & CPI releases · چاودێری ڕووداوە گرنگەکان بکە");
    }
    return block;
  })();

  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .lt("closed_at", endUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as (DailyRow & { closed_at: string })[];

  if (rows.length === 0) {
    return [
      ...header,
      "😴 <b>No signals closed last month</b>",
      "<i>هیچ سیگناڵێک مانگی ڕابردوو نەهاتە تەواوبوون</i>",
      "",
      ...outlookBlock,
      "",
      ...footer,
    ].join("\n");
  }

  // Gold performance.
  const goldRows = rows.filter((r) => r.asset === "XAU/USD");
  const goldPrices = goldRows.flatMap((r) => [Number(r.entry), Number(r.close_price)]).filter((n) => Number.isFinite(n) && n > 0);
  let goldBlock: string[] = [];
  if (goldPrices.length) {
    const high = Math.max(...goldPrices);
    const low = Math.min(...goldPrices);
    const first = Number(goldRows[0]?.entry) || goldPrices[0];
    const last = Number(goldRows[goldRows.length - 1]?.close_price) || goldPrices[goldPrices.length - 1];
    const chg = last - first;
    const chgPct = first ? (chg / first) * 100 : 0;
    const sign = chgPct >= 0 ? "+" : "-";
    goldBlock = [
      "🥇 <b>GOLD:</b>",
      `Monthly High: <code>$${fmt(high)}</code>`,
      `Monthly Low: <code>$${fmt(low)}</code>`,
      `Monthly Change: ${sign}${Math.abs(chgPct).toFixed(1)}%`,
      "",
    ];
  }

  // Bot stats.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  // Best week of the month: group by ISO-week (Monday) and pick the highest P/L.
  const weekPl = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.closed_at);
    const diff = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(monday.getUTCDate() - diff);
    const key = monday.toISOString().slice(0, 10);
    weekPl.set(key, (weekPl.get(key) ?? 0) + pipsToDollars(rowPips(r)));
  }
  const sortedWeeks = [...weekPl.entries()].sort((a, b) => b[1] - a[1]);
  let bestWeekLine = "";
  if (sortedWeeks.length) {
    const [bestMonday, bestPl] = sortedWeeks[0];
    // Week number within the month (1-based).
    const weekNum = Math.floor((new Date(bestMonday).getUTCDate() - 1) / 7) + 1;
    bestWeekLine = `Best Week: Week ${weekNum} (${plStr(bestPl)})`;
  }

  // Signal of the month (highest pips winner).
  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const best = winners[0];

  const lines: string[] = [
    ...header,
    ...goldBlock,
    "🤖 <b>BOT STATS:</b>",
    `Total Signals: ${trades}`,
    `Win Rate: ${winRate}%`,
  ];
  if (bestWeekLine) lines.push(bestWeekLine);
  lines.push(`Total P/L: ${netDot} ${plStr(netPl)}`, "");

  if (best) {
    const meta = ASSET_META[best.asset] ?? { emoji: "🥇", name: best.asset };
    const entry = Number(best.entry) || 0;
    const close = Number(best.close_price) || 0;
    const delta = best.signal === "SELL" ? entry - close : close - entry;
    lines.push(
      "🏆 <b>Signal of the Month:</b>",
      `${meta.emoji} ${meta.name} ${best.signal} @ <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
      `${delta >= 0 ? "+" : "-"}$${fmt(Math.abs(delta))} | ${pipsStr(rowPips(best))} pips ✅`,
      "",
    );
  }

  lines.push(...outlookBlock, "", ...footer);
  return lines.join("\n");
}

// (channel-growth milestones + weekly stats removed)



Deno.serve(async (req) => {

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron sends none */ }
    const loop = body.loop !== false; // default true; pass {loop:false} for a single pass
    const test = body.test === true;  // pass {test:true} to force a sample report to Telegram

    // Config mode: read or set which market regions may open new targets.
    //   {"getConfig": true}                       → returns current enabled regions
    //   {"setRegions": ["Asia","London"]}         → updates enabled regions (empty ⇒ all)
    if (body.getConfig === true) {
      const regions = await getEnabledRegions();
      return new Response(JSON.stringify({ ok: true, regions, all: ALL_REGIONS, openNow: activeRegion(new Date(), regions) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (Array.isArray(body.setRegions)) {
      const regions = await setEnabledRegions(body.setRegions as string[]);
      return new Response(JSON.stringify({ ok: true, regions, all: ALL_REGIONS }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Daily report preview/send.
    //   {"dailyPreview": true}  → build & RETURN the report (does NOT post to Telegram)
    //   {"dailySend": true}     → build the report and post it to the channel now
    if (body.dailyPreview === true || body.dailySend === true) {
      const report = await evaluateDailySummary([], { force: true });
      let sent = false;
      if (body.dailySend === true && report) {
        sent = await sendTelegram("ctp_daily", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Weekly report preview/send (bypasses the time + dedupe gates):
    //   {"weeklyPreview": true}  → build & RETURN the report (does NOT post)
    //   {"weeklySend": true}     → build the report and post it to the channel now
    if (body.weeklyPreview === true || body.weeklySend === true) {
      const report = await evaluateWeeklySummary({ force: true });
      let sent = false;
      if (body.weeklySend === true && report) {
        sent = await sendTelegram("ctp_weekly", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Monthly report preview/send (bypasses the time + dedupe gates):
    //   {"monthlyPreview": true}  → build & RETURN the report (does NOT post)
    //   {"monthlySend": true}     → build the report and post it to the channel now
    if (body.monthlyPreview === true || body.monthlySend === true) {
      const report = await evaluateMonthlySummary({ force: true });
      let sent = false;
      if (body.monthlySend === true && report) {
        sent = await sendTelegram("ctp_monthly", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Session post preview/send (bypasses the time + dedupe gates):
    //   {"sessionPreview": "open"|"close"}  → build & RETURN all 3 region messages
    //   {"sessionSend": "open"|"close"}     → also post them to Telegram now
    const sp = (body.sessionPreview ?? body.sessionSend) as string | undefined;
    if (sp === "open" || sp === "close") {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const quotes = await getPrices();
      const posts: { region: Region; text: string }[] = [];
      for (const region of ALL_REGIONS) {
        const text = sp === "open"
          ? await sessionOpenMessage(region, quotes, now)
          : await sessionCloseMessage(region, quotes, day);
        posts.push({ region, text });
      }
      let sent = 0;
      if (body.sessionSend) {
        for (const p of posts) if (await sendTelegram(`ctp_session_${sp}`, p.text)) sent++;
      }
      return new Response(JSON.stringify({ ok: true, kind: sp, sent, posts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }





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
      const testPriceBySymbol: Record<string, number> = {};
      for (const q of quotes) testPriceBySymbol[q.symbol] = q.price;
      const newsEnriched = await enrichNews(liveNews, testPriceBySymbol);
      const newsBlock = liveNews.map((n, i) => newsBlockItem(n, newsEnriched[i] ?? { titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL" as Impact, urgency: "INFO" as Urgency, tipEn: "", tipKu: "", relatedEn: "", relatedKu: "" }));
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
      lines.push("━━━━━━━━━━━━━━━");
      lines.push(`<i>🕒 ${nowStamp()}</i>`);
      lines.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      const ok = await sendTelegram("ctp_report_test", lines.join("\n"));
      // News goes out as separate messages (each rich block can exceed Telegram's
      // 4096-char limit if bundled), matching the production news flow.
      let newsSent = 0;
      for (const block of newsBlock) {
        if (await sendTelegram("ctp_news", oneNewsMessage(block))) newsSent++;
      }
      return new Response(JSON.stringify({ ok: true, sent: ok, mode: "test", quotes: quotes.length, news: newsBlock.length, newsSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    const signalAlerts: SignalMsg[] = [];
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

    // Calendar once per invocation (≈60s cadence).
    const { calendarAlerts, signalAlerts: calSignals, specialAlerts } = await evaluateCalendar();
    // News only when the 60-min window is open — otherwise skip fetch so items
    // are not marked "alerted" and lost (they'll be picked up next window).
    const newsThrottle = await getState("news_throttle");
    const lastNewsAt = (newsThrottle.lastAt as number) ?? 0;
    const newsWindowOpen = !lastNewsAt || Date.now() - lastNewsAt >= NEWS_MIN_GAP_MS;
    const newsAlerts = newsWindowOpen ? await evaluateNews(lastQuotes) : [];
    // Scheduled session OPEN / CLOSE posts (fire at exact UTC session hours).
    const sessionPosts = await evaluateSessionPosts();
    // End-of-day report (only fires during the 21:00 UTC / 22:00 BST hour).
    const dailySummary = await evaluateDailySummary(lastQuotes);
    // Weekly report (only fires Monday 08:00 BST, deduped per week).
    const weeklySummary = await evaluateWeeklySummary();
    // Monthly report (only fires 1st of month 09:00 BST, deduped per month).
    const monthlySummary = await evaluateMonthlySummary();

    // News-driven targets join the price targets — all sent as separate messages.
    signalAlerts.push(...calSignals);

    let sent = false;
    let targetsSent = 0;

    // 0) SESSION OPEN / CLOSE posts → one standalone message each, logged per day.
    for (const p of sessionPosts) {
      const ok = await sendTelegram(`ctp_session_${p.kind}`, p.text);
      sent = ok || sent;
      if (ok) await recordSessionPost(p.region, p.kind, new Date().toISOString().slice(0, 10));
    }


    // 0b) FOMC/NFP special 🚨 alerts → each as its own high-priority message.
    for (const s of specialAlerts) {
      sent = (await sendTelegram("ctp_special", s)) || sent;
    }

    // 0c) Daily summary at 22:00 BST.
    if (dailySummary) {
      sent = (await sendTelegram("ctp_daily", dailySummary)) || sent;
    }

    // 0d) Weekly report on Monday 08:00 BST.
    if (weeklySummary) {
      sent = (await sendTelegram("ctp_weekly", weeklySummary)) || sent;
    }

    // 0e) Monthly report on the 1st of the month 09:00 BST.
    if (monthlySummary) {
      sent = (await sendTelegram("ctp_monthly", monthlySummary)) || sent;
    }









    // 1) SIGNAL RESULTS (TP/SL hit) → ONLY the result, each as its own message.
    //    Content-hash deduped so the exact same result never repeats within 1h.
    for (const o of outcomeAlerts) {
      const h = contentHash(o);
      if (await wasRecentlySent(h, RESULT_DEDUPE_MS)) continue;
      const ok = await sendTelegram("ctp_result", oneResultMessage(o));
      sent = ok || sent;
      if (ok) { targetsSent++; await recordSent(h, o.slice(0, 120), "result"); }
    }

    // 2) SIGNALS → ONLY signal data, one message each, throttled to ~15–30 min
    //    unless very important. Content-hash deduped (no duplicate signals in 15m).
    if (signalAlerts.length) {
      const throttle = await getState("target_throttle");
      let lastTargetAt = (throttle.lastAt as number) ?? 0;
      for (const sig of signalAlerts) {
        const gapOk = !lastTargetAt || Date.now() - lastTargetAt >= TARGET_MIN_GAP_MS;
        // Skip ordinary targets while inside the throttle window; always send important ones.
        if (!sig.important && !gapOk) continue;
        const h = contentHash(sig.text);
        if (await wasRecentlySent(h, SIGNAL_DEDUPE_MS)) continue;
        const ok = await sendTelegram("ctp_signal", oneSignalMessage("New Trade Target · تارگێتی نوێ", sig.text, sig.reason));
        sent = ok || sent;
        if (ok) { targetsSent++; lastTargetAt = Date.now(); await recordSent(h, sig.text.slice(0, 120), "signal"); }
      }
      await setState("target_throttle", { lastAt: lastTargetAt });
    }

    // 3) CALENDAR → its own standalone message (economic events only).
    //    Calendar alerts are already gated to fire ~30min before each event.
    if (calendarAlerts.length) {
      const ok = await sendTelegram("ctp_calendar", oneCalendarMessage(calendarAlerts.join("\n\n")));
      sent = ok || sent;
    }

    // 4) NEWS → ONLY news, each item as its own standalone message. Exact-headline
    //    deduped against sent_news_log (2h window) so the same news never repeats.
    if (newsAlerts.length) {
      let anyNews = false;
      for (const item of newsAlerts) {
        if (await wasRecentlySent(item.hash, NEWS_DEDUPE_MS)) continue;
        const ok = await sendTelegram("ctp_news", oneNewsMessage(item.block));
        if (ok) { anyNews = true; await recordSent(item.hash, item.headline, "news"); }
      }
      sent = anyNews || sent;
      if (anyNews) await setState("news_throttle", { lastAt: Date.now() });
    }

    return new Response(
      JSON.stringify({ ok: true, sent, targetsSent, sessionPosts: sessionPosts.length, specialAlerts: specialAlerts.length, dailySummary: dailySummary ? 1 : 0, weeklySummary: weeklySummary ? 1 : 0, signalAlerts: signalAlerts.length, outcomeAlerts: outcomeAlerts.length, calendarAlerts: calendarAlerts.length, newsAlerts: newsAlerts.length, quotes: lastQuotes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("market-intel error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
