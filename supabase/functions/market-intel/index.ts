import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ───────────────────── config ─────────────────────
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const ADMIN_CHAT_ID = "144068979";

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
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.twelvedata.com/quote?symbol=WTI/USD&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const price = Number(d?.close ?? d?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const changePct = Number(d?.percent_change) || 0;
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

// ───────────────────── HTTP ─────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron sends none */ }
    const loop = body.loop !== false; // default true; pass {loop:false} for a single pass

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

    // Calendar once per invocation (≈60s cadence).
    const eventAlerts = await evaluateCalendar();

    // Compose & send a single premium alert if anything fired.
    let sent = false;
    if (priceAlerts.length || eventAlerts.length) {
      const lines: string[] = ["🔥 <b>MARKET ALERT</b>", ""];
      if (priceAlerts.length) lines.push(priceAlerts.join("\n\n"), "");
      if (eventAlerts.length) {
        lines.push("📰 <b>Economic Calendar / ساڵنامەی ئابووری</b>", "");
        lines.push(eventAlerts.join("\n\n"), "");
      }
      lines.push(`<i>🕒 ${nowStamp()}</i>`);
      lines.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      sent = await sendTelegram("market_alert", lines.join("\n"));
    }

    return new Response(
      JSON.stringify({ ok: true, sent, priceAlerts: priceAlerts.length, eventAlerts: eventAlerts.length, quotes: lastQuotes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("market-intel error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
