import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Candle,
  pts,
  assessVolatility,
  volatilityPercent,
} from "./volatility.ts";
import { botWeekendBlocked, isForexMarketClosed } from "./weekend-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_STARTING_BALANCE = 5000;

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400,
};

// ───────────────────── scalping config ─────────────────────
// Timeframes under/at 15m run in fast "scalp" mode: exit the moment a trade is
// green, take a half-target on reversals, and never let a winner turn to loss.
const SCALP_TIMEFRAMES = new Set(["1m", "5m", "15m"]);
const isScalp = (tf: string) => SCALP_TIMEFRAMES.has(tf);
// Minimum profit (as a %) at which a scalp trade is closed immediately.
const MIN_SCALP_PROFIT_PCT = 0.1;
// Once a scalp trade has been this far in profit (% of full TP) we protect the
// gain: if price reverses back toward break-even we close in the green.
const SCALP_LOCK_FRACTION = 0.5;

// ───────────────────── risk protection (USD, per single trade) ─────────────────────
// Once a trade is at least this much in profit, move the Stop Loss to break-even
// (the entry price) so a winning trade can never turn into a loss.
const BREAKEVEN_TRIGGER_USD = 2.00;
// Hard max loss: if a single trade reaches this unrealized loss, close it
// immediately instead of waiting for the Stop Loss.
const MAX_LOSS_USD = 5.00;

// ───────────────────── daily limits (USD, per user, per UTC day) ─────────────────────
// Stop trading for the rest of the day once the day's realized P/L crosses these.
const DAILY_LOSS_LIMIT_USD = 20.00;   // pause at −$20 total for the day
const DAILY_PROFIT_TARGET_USD = 50.00; // lock in profits at +$50 total for the day

// ───────────────────── news filter ─────────────────────
// High-impact USD / gold events freeze new entries and force-close open trades
// when they are imminent. Times are minutes before the event.
const NEWS_BLOCK_NEW_MIN = 60;   // no NEW trades within 60 min of a high-impact event
const NEWS_CLOSE_OPEN_MIN = 10;  // CLOSE open trades within 10 min of the event
const CALENDAR_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
];

// Volatility filter (assessVolatility, thresholds, Candle/VolReport types and
// the gauge math) lives in ./volatility.ts so it can be unit-tested without
// booting the HTTP server. See that module for the full documentation.




const CRYPTO_BINANCE: Record<string, string> = {
  "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT", "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT", "XRP/USD": "XRPUSDT",
};
const BINANCE_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h",
};
const METAL_CODES: Record<string, string> = { "XAU/USD": "XAU", "XAG/USD": "XAG" };



// ───────────────────── indicators ─────────────────────
function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function emaLast(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}
function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function calcMACD(closes: number[]): { histogram: number } | null {
  if (closes.length < 35) return null;
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const offset = fast.length - slow.length;
  const macdLine: number[] = [];
  for (let i = 0; i < slow.length; i++) macdLine.push(fast[i + offset] - slow[i]);
  const sig = emaSeries(macdLine, 9);
  if (!sig.length) return null;
  return { histogram: macdLine[macdLine.length - 1] - sig[sig.length - 1] };
}

// ───────────────────── market week (UTC) ─────────────────────
// Spot Forex / Gold / Oil are CLOSED from Friday 22:00 UTC to Sunday 22:00 UTC.
// Crypto is 24/7. Bots on non-crypto symbols must NOT open trades on the weekend.
function isForexMarketClosed(d = new Date()): boolean {
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const h = d.getUTCHours();
  if (dow === 6) return true; // all of Saturday
  if (dow === 0) return h < 22; // Sunday before 22:00 UTC
  if (dow === 5) return h >= 22; // Friday from 22:00 UTC
  return false; // Mon–Thu
}

// ───────────────────── prices & candles ─────────────────────
async function getPrice(symbol: string): Promise<number | null> {
  try {
    if (CRYPTO_BINANCE[symbol]) {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${CRYPTO_BINANCE[symbol]}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) { await res.text(); return null; }
      const d = await res.json();
      const p = Number(d?.price);
      return Number.isFinite(p) && p > 0 ? p : null;
    }
    if (METAL_CODES[symbol]) {
      const res = await fetch(`https://api.gold-api.com/price/${METAL_CODES[symbol]}`, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { await res.text(); return null; }
      const d = await res.json();
      const p = Number(d?.price);
      return Number.isFinite(p) && p > 0 ? p : null;
    }
    // forex
    const map: Record<string, [string, boolean]> = {
      "EUR/USD": ["EUR", true], "GBP/USD": ["GBP", true], "USD/JPY": ["JPY", false],
    };
    const m = map[symbol];
    if (m) {
      const res = await fetch(
        `https://api.frankfurter.app/latest?base=USD&symbols=${m[0]}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) { await res.text(); return null; }
      const d = await res.json();
      const rate = Number(d?.rates?.[m[0]]);
      if (!Number.isFinite(rate) || rate <= 0) return null;
      return m[1] ? 1 / rate : rate;
    }
  } catch (e) {
    console.error("getPrice error", symbol, e);
  }
  return null;
}

async function getCandles(symbol: string, timeframe: string, livePrice: number): Promise<Candle[]> {
  // Crypto: real klines from Binance.
  if (CRYPTO_BINANCE[symbol]) {
    try {
      const interval = BINANCE_INTERVAL[timeframe] || "5m";
      const url = `https://api.binance.com/api/v3/klines?symbol=${CRYPTO_BINANCE[symbol]}&interval=${interval}&limit=100`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const rows = await res.json();
        const candles = rows.map((r: unknown[]) => ({
          time: Math.floor(Number(r[0]) / 1000),
          open: Number(r[1]), high: Number(r[2]), low: Number(r[3]),
          close: Number(r[4]), volume: Number(r[5]),
        }));
        if (candles.length > 30) return candles;
      } else { await res.text(); }
    } catch (e) {
      console.error("klines error", e);
    }
  }
  // Metals / forex / fallback: synthetic OHLC around the live spot price (±0.1% walk).
  const candles: Candle[] = [];
  const tfSec = TIMEFRAME_SECONDS[timeframe] || 300;
  let prevClose = livePrice * (1 - (Math.random() - 0.5) * 0.004);
  const now = Math.floor(Date.now() / 1000);
  for (let i = 99; i >= 0; i--) {
    const drift = (Math.random() - 0.5) * 0.002 * livePrice;
    const open = prevClose;
    // Nudge the final candle to converge on the real live price.
    const close = i === 0 ? livePrice : open + drift;
    const high = Math.max(open, close) * (1 + Math.random() * 0.0008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.0008);
    const volume = 1000 + Math.random() * 2000 + (Math.random() < 0.1 ? 4000 : 0);
    candles.push({ time: now - i * tfSec, open, high, low, close, volume });
    prevClose = close;
  }
  return candles;
}

// ───────────────────── logging ─────────────────────
function hhmmss(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
async function log(botId: string, userId: string, level: string, message: string) {
  await admin.from("bot_logs").insert({ bot_id: botId, user_id: userId, level, message });
}
async function notify(
  userId: string,
  botId: string | null,
  type: string,
  title: string,
  message: string,
  pnl?: number,
) {
  await admin.from("bot_notifications").insert({
    user_id: userId, bot_id: botId, type, title, message,
    pnl: pnl == null ? null : +pnl.toFixed(2),
  });
}

// Persistent pause/stop state. Records WHY a bot is paused (for the in-app
// banner) and only sends a notification when the reason CHANGES — so a bot
// sitting in e.g. LOW volatility never spams an alert every scan tick.
async function setPauseReason(
  bot: Record<string, unknown>,
  code: string,
  type: string,
  title: string,
  message: string,
  pnl?: number,
) {
  const botId = bot.id as string;
  const userId = bot.user_id as string;
  const changed = (bot.pause_reason as string | null) !== code;
  await admin
    .from("bots")
    .update({ pause_reason: code, pause_reason_at: new Date().toISOString() })
    .eq("id", botId);
  bot.pause_reason = code;
  if (changed) await notify(userId, botId, type, title, message, pnl);
}

// Clear the pause reason once the bot is trading normally again.
async function clearPauseReason(bot: Record<string, unknown>) {
  if (bot.pause_reason == null) return;
  bot.pause_reason = null;
  await admin
    .from("bots")
    .update({ pause_reason: null, pause_reason_at: null })
    .eq("id", bot.id as string);
}
function fmt(n: number, symbol: string): string {
  const dec = symbol === "USD/JPY" ? 3 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ───────────────────── balance ─────────────────────
async function applyBalance(userId: string, pnl: number): Promise<number> {
  const { data } = await admin
    .from("demo_accounts")
    .select("balance, realized_pnl")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    const start = Math.max(0, +(DEMO_STARTING_BALANCE + pnl).toFixed(2));
    await admin.from("demo_accounts").insert({
      user_id: userId, balance: start, starting_balance: DEMO_STARTING_BALANCE, realized_pnl: +pnl.toFixed(2),
    });
    return start;
  }
  const next = Math.max(0, +(Number(data.balance) + pnl).toFixed(2));
  await admin
    .from("demo_accounts")
    .update({ balance: next, realized_pnl: +(Number(data.realized_pnl ?? 0) + pnl).toFixed(2), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return next;
}

// ───────────────────── close a trade ─────────────────────
// `kind` describes WHY we closed (for logs/notifications). It is mapped to the
// DB enum (tp/sl/manual) so no migration is needed: every profit-taking scalp
// exit is recorded as "tp", stop-loss as "sl".
type CloseKind = "tp" | "sl" | "manual" | "scalp_profit" | "scalp_reversal" | "scalp_breakeven" | "max_loss" | "breakeven" | "news";

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

async function closeTrade(bot: Record<string, unknown>, trade: Record<string, unknown>, exitPrice: number, kind: CloseKind) {
  const botId = bot.id as string;
  const userId = bot.user_id as string;
  const symbol = bot.symbol as string;
  const entry = Number(trade.entry_price);
  const amount = Number(trade.amount);
  const dir = trade.direction as string;
  const diffPct = dir === "buy" ? (exitPrice - entry) / entry : (entry - exitPrice) / entry;
  const pnl = +(diffPct * amount).toFixed(2);
  const pnlPct = +(diffPct * 100).toFixed(2);
  const win = pnl >= 0;

  // How long the trade was open.
  const openedAt = trade.opened_at ? new Date(trade.opened_at as string).getTime() : Date.now();
  const durationSec = Math.max(0, Math.round((Date.now() - openedAt) / 1000));

  // Map our rich reason to the DB enum.
  const dbReason: "tp" | "sl" | "manual" =
    (kind === "sl" || kind === "max_loss" || kind === "breakeven") ? "sl"
      : kind === "manual" ? "manual" : "tp";

  await admin.from("bot_trades").update({
    status: "closed", exit_price: exitPrice, pnl, pnl_pct: pnlPct,
    result: win ? "win" : "loss", close_reason: dbReason, closed_at: new Date().toISOString(),
  }).eq("id", trade.id as string);

  const newBalance = await applyBalance(userId, pnl);

  // Track consecutive losses → auto-pause after 3 in a row.
  const prevStreak = Number(bot.consecutive_losses) || 0;
  const streak = win ? 0 : prevStreak + 1;
  const autoPause = streak >= 3;

  await admin.from("bots").update({
    status: "stopped",
    trades_count: (Number(bot.trades_count) || 0) + 1,
    wins_count: (Number(bot.wins_count) || 0) + (win ? 1 : 0),
    total_pnl: +((Number(bot.total_pnl) || 0) + pnl).toFixed(2),
    consecutive_losses: streak,
    auto_paused: autoPause,
    last_scan_at: new Date().toISOString(),
  }).eq("id", botId);

  const sign = pnl >= 0 ? "+" : "-";
  const dur = fmtDuration(durationSec);

  // Human label for the exit reason.
  let reasonLabel: string;
  switch (kind) {
    case "scalp_profit": reasonLabel = "took minimum profit"; break;
    case "scalp_reversal": reasonLabel = "half-target locked on reversal"; break;
    case "scalp_breakeven": reasonLabel = "protected winner near break-even"; break;
    case "tp": reasonLabel = "TP target hit"; break;
    case "sl": reasonLabel = "hit stop loss"; break;
    case "max_loss": reasonLabel = `max loss protection (-$${MAX_LOSS_USD.toFixed(2)})`; break;
    case "breakeven": reasonLabel = "break-even stop (winner protected)"; break;
    case "news": reasonLabel = "closed before high-impact news"; break;
    case "manual": reasonLabel = "manually closed"; break;
  }

  if (win) {
    // 💰 Closed at profit
    await log(botId, userId, "win",
      `[${hhmmss()}] 💰 Closed at profit: ${sign}$${fmt(Math.abs(pnl), symbol)} (${sign}${Math.abs(pnlPct)}%) — ${reasonLabel} · ${dir.toUpperCase()} @ $${fmt(exitPrice, symbol)}`);
  } else {
    // 🛑 Closed at loss
    await log(botId, userId, "loss",
      `[${hhmmss()}] 🛑 Closed at loss: -$${fmt(Math.abs(pnl), symbol)} (-${Math.abs(pnlPct)}%) — ${reasonLabel} · ${dir.toUpperCase()} @ $${fmt(exitPrice, symbol)}`);
  }
  // 📋 TRADE REPORT — entry→exit, duration, result, running daily total.
  const daily = await getDailyPnl(userId);
  const dSign = daily.pnl >= 0 ? "+" : "-";
  await log(botId, userId, "info",
    `[${hhmmss()}] 📋 TRADE REPORT — ${dir.toUpperCase()} ${symbol} | Entry $${fmt(entry, symbol)} → Exit $${fmt(exitPrice, symbol)} | ${dur} | ${win ? "✅ WIN" : "❌ LOSS"} ${sign}$${fmt(Math.abs(pnl), symbol)} | 📊 Today: ${dSign}$${fmt(Math.abs(daily.pnl), symbol)} (${daily.trades} trades)`);
  await log(botId, userId, "info", `[${hhmmss()}] 🤖 Bot auto-stopped after trade close`);
  await log(botId, userId, "info", `[${hhmmss()}] 💰 Balance updated: $${newBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  // 🛑 Daily limits — pause for the rest of the day once a threshold is crossed.
  if (daily.pnl <= -DAILY_LOSS_LIMIT_USD) {
    await log(botId, userId, "loss",
      `[${hhmmss()}] 🛑 Daily loss limit reached (${dSign}$${fmt(Math.abs(daily.pnl), symbol)}) - bot paused until tomorrow`);
    await setPauseReason(bot, "daily_loss", "bot_stopped_loss", "🛑 Bot Stopped - Loss Limit Hit",
      `Daily loss of -$${fmt(Math.abs(daily.pnl), symbol)} reached. Bot paused until tomorrow UTC midnight. · Current P/L: -$${fmt(Math.abs(daily.pnl), symbol)}`,
      daily.pnl);
  } else if (daily.pnl >= DAILY_PROFIT_TARGET_USD) {
    await log(botId, userId, "win",
      `[${hhmmss()}] 🎯 Daily target reached (+$${fmt(daily.pnl, symbol)})! Locking in profits.`);
    await setPauseReason(bot, "daily_target", "bot_stopped_target", "🎯 Bot Stopped - Target Reached!",
      `Daily profit of +$${fmt(daily.pnl, symbol)} locked in! Great trading day. Bot stopped. · Current P/L: +$${fmt(daily.pnl, symbol)}`,
      daily.pnl);
  }

  // 🔔 Notify the user the trade was closed (with result).
  const botName = (bot.name as string) || symbol;
  await notify(
    userId, botId, win ? "trade_win" : "trade_loss",
    win ? `🏆 ${botName} — Trade Won` : `💔 ${botName} — Trade Lost`,
    `${dir.toUpperCase()} ${symbol} closed @ $${fmt(exitPrice, symbol)} (${reasonLabel}) · P/L ${sign}$${fmt(Math.abs(pnl), symbol)} (${sign}${Math.abs(pnlPct)}%) · ${dur}`,
    pnl,
  );

  // ⏸ Auto-pause after 3 consecutive losses.
  if (autoPause) {
    await log(botId, userId, "info", `[${hhmmss()}] ⏸ AUTO-PAUSED — ${streak} losses in a row. Bot paused for safety.`);
    await setPauseReason(
      bot, "loss_streak", "auto_pause",
      `⏸ ${botName} Auto-Paused`,
      `Bot paused after ${streak} losing trades in a row. Review your settings before restarting. · Current P/L: ${daily.pnl >= 0 ? "+" : "-"}$${fmt(Math.abs(daily.pnl), symbol)}`,
    );
  } else if (!win) {
    await log(botId, userId, "info", `[${hhmmss()}] ⚠️ Loss streak: ${streak}/3 before auto-pause.`);
  }
}

// ───────────────────── live recommendation (hold vs close) ─────────────────────
// Posts an "advice" log at most once per ~55s so the user can see, in real time,
// whether the bot suggests holding the position or closing it manually.
async function maybeLogAdvice(
  botId: string, userId: string, symbol: string, dir: string,
  entry: number, price: number, sl: number, tp: number, amount: number,
) {
  // Throttle: skip if we logged advice in the last 55 seconds.
  const { data: last } = await admin
    .from("bot_logs")
    .select("created_at")
    .eq("bot_id", botId)
    .eq("level", "advice")
    .order("created_at", { ascending: false })
    .limit(1);
  if (last && last.length) {
    const age = Date.now() - new Date(last[0].created_at as string).getTime();
    if (age < 55_000) return;
  }

  const diffPct = dir === "buy" ? (price - entry) / entry : (entry - price) / entry;
  const pnl = diffPct * amount;
  const sign = pnl >= 0 ? "+" : "-";

  // Progress toward TP (positive) vs toward SL (negative), 0..1 each way.
  const tpDist = Math.abs(tp - entry);
  const slDist = Math.abs(entry - sl);
  const moved = dir === "buy" ? price - entry : entry - price;
  const towardTp = tpDist > 0 ? Math.max(0, moved) / tpDist : 0;
  const towardSl = slDist > 0 ? Math.max(0, -moved) / slDist : 0;

  let verdict: string;
  if (towardTp >= 0.6) {
    verdict = `🟢 HOLD — strong, ${Math.round(towardTp * 100)}% to take-profit. Let it run.`;
  } else if (towardSl >= 0.6) {
    verdict = `🔴 CONSIDER CLOSING — ${Math.round(towardSl * 100)}% to stop-loss. You may close manually now.`;
  } else if (moved >= 0) {
    verdict = `🟢 HOLD — in profit, trade on track.`;
  } else {
    verdict = `🟡 HOLD — slightly against, still within range.`;
  }

  await log(botId, userId, "advice",
    `[${hhmmss()}] 🤖 ${dir.toUpperCase()} @ $${fmt(entry, symbol)} → now $${fmt(price, symbol)} | Unrealized: ${sign}$${fmt(Math.abs(pnl), symbol)} (${sign}${Math.abs(diffPct * 100).toFixed(2)}%) | ${verdict}`);
}

// ───────────────────── scalp monitoring heartbeat ─────────────────────
// Logs a "Monitoring..." line roughly every 5 seconds while a scalp trade is
// open, e.g. "Monitoring... BTC $64,200 P/L: +$0.50 — HOLD".
// `force` bypasses the throttle (used for the final CLOSING line).
async function maybeLogScalpCheck(
  botId: string, userId: string, symbol: string, price: number,
  pnl: number, pnlPct: number, scalp: boolean, verdict: string, force: boolean,
) {
  if (!scalp) return;
  if (!force) {
    const { data: last } = await admin
      .from("bot_logs")
      .select("created_at")
      .eq("bot_id", botId)
      .eq("level", "advice")
      .order("created_at", { ascending: false })
      .limit(1);
    if (last && last.length) {
      const age = Date.now() - new Date(last[0].created_at as string).getTime();
      if (age < 4_500) return; // ~every 5 seconds
    }
  }
  const sign = pnl >= 0 ? "+" : "-";
  await log(botId, userId, "advice",
    `[${hhmmss()}] ⏱️ Monitoring... ${symbol} $${fmt(price, symbol)} P/L: ${sign}$${fmt(Math.abs(pnl), symbol)} (${sign}${Math.abs(pnlPct).toFixed(2)}%) — ${verdict}`);
}

// ───────────────────── daily P/L (per user, current UTC day) ─────────────────────
// Sums realized P/L from trades closed since 00:00 UTC today.
async function getDailyPnl(userId: string): Promise<{ pnl: number; trades: number }> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("bot_trades")
    .select("pnl")
    .eq("user_id", userId)
    .eq("status", "closed")
    .gte("closed_at", startOfDay.toISOString());
  const rows = data ?? [];
  const pnl = rows.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  return { pnl: +pnl.toFixed(2), trades: rows.length };
}

// ───────────────────── economic calendar (news filter) ─────────────────────
// Cached for 5 minutes across all bots processed in one sweep.
type NewsEvent = { title: string; country: string; impact: string; time: number };
let _newsCache: { at: number; events: NewsEvent[] } | null = null;

async function getHighImpactUsdEvents(): Promise<NewsEvent[]> {
  if (_newsCache && Date.now() - _newsCache.at < 5 * 60_000) return _newsCache.events;
  const events: NewsEvent[] = [];
  try {
    for (const url of CALENDAR_URLS) {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { await r.text(); continue; }
      const j = await r.json();
      if (!Array.isArray(j)) continue;
      for (const e of j as Record<string, string>[]) {
        const impact = (e.impact || "").toLowerCase();
        const country = (e.country || "").toUpperCase();
        // Gold (XAU) is USD-driven → only USD high-impact events matter.
        if (impact !== "high") continue;
        if (country !== "USD") continue;
        const t = e.date ? Date.parse(e.date) : NaN;
        if (Number.isNaN(t)) continue;
        events.push({ title: e.title ?? "Event", country, impact, time: t });
      }
    }
  } catch (e) {
    console.error("calendar fetch error", e);
  }
  _newsCache = { at: Date.now(), events };
  return events;
}

// Finds the nearest upcoming high-impact USD event within `withinMin` minutes.
function nextEventWithin(events: NewsEvent[], withinMin: number): { ev: NewsEvent; minutes: number } | null {
  const now = Date.now();
  let best: { ev: NewsEvent; minutes: number } | null = null;
  for (const ev of events) {
    const diffMin = (ev.time - now) / 60_000;
    if (diffMin >= 0 && diffMin <= withinMin) {
      if (!best || diffMin < best.minutes) best = { ev, minutes: diffMin };
    }
  }
  return best;
}

async function processBot(bot: Record<string, unknown>) {
  const botId = bot.id as string;
  const userId = bot.user_id as string;
  const symbol = bot.symbol as string;
  const timeframe = bot.timeframe as string;

  const price = await getPrice(symbol);
  if (price == null) {
    await log(botId, userId, "info", `[${hhmmss()}] ⚠️ Price unavailable for ${symbol}, retrying next cycle`);
    return;
  }

  // 1) If a trade is open → monitor TP/SL and post a hold/close recommendation.
  // Fetch as a list (never .maybeSingle, which errors if duplicates ever exist)
  // and take the oldest open trade.
  const { data: openRows } = await admin
    .from("bot_trades")
    .select("*")
    .eq("bot_id", botId)
    .eq("status", "open")
    .order("opened_at", { ascending: true })
    .limit(1);
  const openTrade = openRows && openRows.length ? openRows[0] : null;

  if (openTrade) {
    const dir = openTrade.direction as string;
    const entry = Number(openTrade.entry_price);
    const amount = Number(openTrade.amount);
    const tp = Number(openTrade.tp_price);
    const sl = Number(openTrade.sl_price);
    const scalp = isScalp(timeframe);

    // Current unrealized P/L at the live price.
    const diffPct = dir === "buy" ? (price - entry) / entry : (entry - price) / entry;
    const pnlPct = diffPct * 100;
    const pnl = diffPct * amount;

    // 1-NEWS) NEWS FILTER — force-close USD-sensitive trades when a high-impact
    // USD/gold event is within 10 minutes (don't risk the spike).
    const usdSensitive = !CRYPTO_BINANCE[symbol];
    if (usdSensitive) {
      const ev = nextEventWithin(await getHighImpactUsdEvents(), NEWS_CLOSE_OPEN_MIN);
      if (ev) {
        await log(botId, userId, "loss",
          `[${hhmmss()}] ⛔ Closing trade - ${ev.ev.title} in ${Math.round(ev.minutes)}min (high-impact USD news)`);
        await notify(userId, botId, "news_close", "📰 Trade Closed - News Incoming",
          `High impact event in ${Math.round(ev.minutes)}min. Trade closed for safety. · ${ev.ev.title} · Current P/L: ${pnl >= 0 ? "+" : "-"}$${fmt(Math.abs(pnl), symbol)}`,
          pnl);
        await closeTrade(bot, openTrade, price, "news");
        return;
      }
    }

    // 1a) Hard TP / SL — always enforced (instant, no waiting).
    let hit: CloseKind | null = null;
    let exit = price;
    if (dir === "buy") {
      if (price >= tp) { hit = "tp"; exit = tp; }
      else if (price <= sl) { hit = "sl"; exit = sl; }
    } else {
      if (price <= tp) { hit = "tp"; exit = tp; }
      else if (price >= sl) { hit = "sl"; exit = sl; }
    }

    // 1a-MAX) MAX LOSS PROTECTION — if a single trade is down $5.00 or more,
    // close immediately at the live price instead of waiting for the SL.
    if (!hit && pnl <= -MAX_LOSS_USD) {
      hit = "max_loss";
      exit = price;
      await log(botId, userId, "loss",
        `[${hhmmss()}] 🚨 MAX LOSS hit (-$${fmt(Math.abs(pnl), symbol)}) — closing immediately to cap the loss`);
      await notify(userId, botId, "trade_emergency", "⚠️ Trade Closed - Max Loss",
        `Single trade hit -$${MAX_LOSS_USD.toFixed(2)} limit. Trade closed to protect account. · Current P/L: -$${fmt(Math.abs(pnl), symbol)}`,
        pnl);
    }

    // 1a-BE) MIN PROFIT EXIT → BREAK-EVEN — once a trade is at least +$2.00,
    // move the Stop Loss up to the entry price so a winner can't turn into a loss.
    if (!hit && pnl >= BREAKEVEN_TRIGGER_USD) {
      const atBreakeven = dir === "buy" ? sl >= entry : sl <= entry;
      if (!atBreakeven) {
        const beSl = +entry.toFixed(4);
        await admin.from("bot_trades").update({ sl_price: beSl }).eq("id", openTrade.id as string);
        openTrade.sl_price = beSl;
        await log(botId, userId, "info",
          `[${hhmmss()}] 🛡️ +$${fmt(pnl, symbol)} profit → Stop Loss moved to break-even @ $${fmt(entry, symbol)} (risk-free trade)`);
        await notify(userId, botId, "breakeven", "🛡️ Stop Loss → Break Even",
          `Trade in profit +$${fmt(pnl, symbol)}. SL moved to entry price. Risk = zero now. · Current P/L: +$${fmt(pnl, symbol)}`,
          pnl);
      }
    }

    // 1b) SCALP MODE (1m / 5m / 15m): close fast on minimum profit, never let a
    // winner turn into a loss, and lock half-target on reversals.
    if (!hit && scalp) {
      // Distance to full TP, as a % of price.
      const tpPctFull = Math.abs((tp - entry) / entry) * 100;
      const halfTarget = tpPctFull * SCALP_LOCK_FRACTION;

      if (pnlPct >= MIN_SCALP_PROFIT_PCT && pnlPct >= halfTarget) {
        // Reached at least half the take-profit target → lock it in.
        hit = "scalp_reversal";
        exit = price;
      } else if (pnlPct >= MIN_SCALP_PROFIT_PCT) {
        // Green by at least the minimum → take the quick profit immediately.
        hit = "scalp_profit";
        exit = price;
      }
    }

    if (hit) {
      // Final monitoring line announcing the close.
      await maybeLogScalpCheck(
        botId, userId, symbol, price, pnl, pnlPct, scalp,
        `${pnlPct >= 0 ? "🟢 P/L positive → CLOSING" : "🔴 Stop hit → CLOSING"}`,
        true,
      );
      await closeTrade(bot, openTrade, exit, hit);
      return;
    }

    if (scalp) {
      // ⏱️ Fast monitoring heartbeat (~every 5s) so the user sees live decisions.
      await maybeLogScalpCheck(
        botId, userId, symbol, price, pnl, pnlPct, scalp,
        pnlPct > 0 ? "HOLD (green, waiting for min profit)" : "HOLD (within range)",
        false,
      );
    } else {
      // Higher timeframes keep the original ~once-a-minute hold/close advice.
      await maybeLogAdvice(botId, userId, symbol, dir, entry, price, sl, tp, amount);
    }
    return; // while a trade is open the bot does not scan for new entries
  }

  // 2) No open trade. Only running bots scan.
  if (bot.status !== "running") return;

  // Scalp timeframes scan fast (~every 10s) so trades open quickly on a signal;
  // higher timeframes scan once per candle.
  const interval = isScalp(timeframe) ? 10 : (TIMEFRAME_SECONDS[timeframe] || 300);
  const lastScan = bot.last_scan_at ? new Date(bot.last_scan_at as string).getTime() : 0;
  if (lastScan && Date.now() - lastScan < interval * 1000) return; // not time yet

  // Mark scan time up-front so skip-guards below don't spam the log every tick.
  await admin.from("bots").update({ last_scan_at: new Date().toISOString() }).eq("id", botId);

  // GUARD A) DAILY LIMITS — stop opening new trades for the rest of the UTC day
  // once the day's total P/L crosses the loss limit or the profit target.
  const dayPnl = await getDailyPnl(userId);
  if (dayPnl.pnl <= -DAILY_LOSS_LIMIT_USD) {
    await log(botId, userId, "loss",
      `[${hhmmss()}] 🛑 Daily loss limit reached (-$${fmt(Math.abs(dayPnl.pnl), symbol)}) - bot paused until tomorrow`);
    await setPauseReason(bot, "daily_loss", "bot_stopped_loss", "🛑 Bot Stopped - Loss Limit Hit",
      `Daily loss of -$${fmt(Math.abs(dayPnl.pnl), symbol)} reached. Bot paused until tomorrow UTC midnight. · Current P/L: -$${fmt(Math.abs(dayPnl.pnl), symbol)}`,
      dayPnl.pnl);
    return;
  }
  if (dayPnl.pnl >= DAILY_PROFIT_TARGET_USD) {
    await log(botId, userId, "win",
      `[${hhmmss()}] 🎯 Daily target reached (+$${fmt(dayPnl.pnl, symbol)})! Locking in profits.`);
    await setPauseReason(bot, "daily_target", "bot_stopped_target", "🎯 Bot Stopped - Target Reached!",
      `Daily profit of +$${fmt(dayPnl.pnl, symbol)} locked in! Great trading day. Bot stopped. · Current P/L: +$${fmt(dayPnl.pnl, symbol)}`,
      dayPnl.pnl);
    return;
  }

  // (No time-of-day filter anymore — the bot trades 24/7 and gates on live
  //  volatility instead, evaluated below once we have the latest candles.)

  // GUARD A2) WEEKEND MARKET CLOSURE — Gold/Oil/Forex (non-crypto) bots must not
  // open new trades while the spot market is closed (Fri 22:00 → Sun 22:00 UTC).
  // Crypto bots are unaffected (24/7).
  if (!CRYPTO_BINANCE[symbol] && isForexMarketClosed()) {
    await log(botId, userId, "info",
      `[${hhmmss()}] 🔴 Market closed (weekend) - no new ${symbol} trades until Sun 22:00 UTC`);
    await setPauseReason(bot, "market_closed", "bot_paused", "🔴 Bot Paused - Market Closed",
      `${symbol} market is closed for the weekend. Trading resumes Sunday 22:00 UTC.`);
    return;
  }





  // GUARD C) NEWS FILTER — no new trades within 60 min of a high-impact USD event.
  if (!CRYPTO_BINANCE[symbol]) {
    const ev = nextEventWithin(await getHighImpactUsdEvents(), NEWS_BLOCK_NEW_MIN);
    if (ev) {
      await log(botId, userId, "info",
        `[${hhmmss()}] ⛔ No trade - ${ev.ev.title} in ${Math.round(ev.minutes)}min`);
      await setPauseReason(bot, `news_block:${ev.ev.title}`, "bot_paused", "⛔ Bot Paused - High Impact News",
        `${ev.ev.title} in ${Math.round(ev.minutes)}min - bot blocked to protect your account. Resumes after.`);
      return;
    }
  }

  // 3) Scan.
  const candles = await getCandles(symbol, timeframe, price);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const ema9 = emaLast(closes, 9);
  const ema21 = emaLast(closes, 21);
  const ema50 = emaLast(closes, 50);
  const rsi = calcRSI(closes, 14);
  const macd = calcMACD(closes);
  const hist = macd?.histogram ?? 0;
  const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const curVol = volumes[volumes.length - 1];
  const volSpike = curVol > avgVol * 1.5;

  // GUARD B) VOLATILITY FILTER — only trade when the market is moving and the
  // spread is tight. LOW → wait, MEDIUM → half lot, HIGH → full lot.
  const vol = assessVolatility(price, candles);
  if (vol.level === "LOW") {
    await log(botId, userId, "info",
      `[${hhmmss()}] ⏸️ Volatility: LOW - spread ${pts(vol.spread)}, avg move ${pts(vol.avgMove)}pts - waiting`);
    await setPauseReason(bot, "vol_low", "bot_paused", "⏸️ Bot Paused - Market Too Quiet",
      `Spread too wide or candles too small. Waiting for better conditions. · Spread ${pts(vol.spread)}pts`);
    return;
  }
  // Conditions are tradeable again — clear any pause banner.
  await clearPauseReason(bot);
  if (vol.level === "MEDIUM") {
    await log(botId, userId, "info",
      `[${hhmmss()}] 🟡 Volatility: MEDIUM - spread ${pts(vol.spread)}, avg move ${pts(vol.avgMove)}pts - trading smaller lot`);
  } else {
    await log(botId, userId, "signal",
      `[${hhmmss()}] 📊 Volatility: HIGH - spread ${pts(vol.spread)}, avg move ${pts(vol.avgMove)}pts - entering trade`);
  }
  await log(botId, userId, "info", `[${hhmmss()}] 📊 Analyzing ${symbol} on ${timeframe}...`);
  if (ema9 != null && ema21 != null) {
    await log(botId, userId, "info", `[${hhmmss()}] 📈 EMA9 (${fmt(ema9, symbol)}) ${ema9 > ema21 ? ">" : "<"} EMA21 (${fmt(ema21, symbol)}) → ${ema9 > ema21 ? "Uptrend ✓" : "Downtrend ✓"}`);
  }
  if (ema50 != null) {
    await log(botId, userId, "info", `[${hhmmss()}] 🧭 Trend EMA50 (${fmt(ema50, symbol)}) → Price ${price > ema50 ? "above ✓ (Bullish)" : "below ✓ (Bearish)"}`);
  }
  if (rsi != null) {
    const tag = rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral";
    await log(botId, userId, "info", `[${hhmmss()}] 💹 RSI: ${rsi.toFixed(1)} → ${tag}`);
  }
  await log(botId, userId, "info", `[${hhmmss()}] 📉 MACD Histogram: ${hist >= 0 ? "+" : ""}${hist.toFixed(3)} → ${hist > 0 ? "Bullish ✓" : "Bearish"}`);
  await log(botId, userId, "info", `[${hhmmss()}] 🔊 Volume: ${volSpike ? "SPIKE detected ✓" : "Normal"}`);

  let buyScore = 0, sellScore = 0;
  const buyReasons: string[] = [], sellReasons: string[] = [];
  if (ema9 != null && ema21 != null) {
    if (ema9 > ema21) { buyScore++; buyReasons.push("EMA9>EMA21 uptrend"); }
    if (ema9 < ema21) { sellScore++; sellReasons.push("EMA9<EMA21 downtrend"); }
  }
  if (rsi != null) {
    if (rsi < 55) { buyScore++; buyReasons.push(`RSI ${rsi.toFixed(0)} (room to rise)`); }
    if (rsi > 45) { sellScore++; sellReasons.push(`RSI ${rsi.toFixed(0)} (room to fall)`); }
  }
  if (hist > 0) { buyScore++; buyReasons.push("MACD bullish"); }
  if (hist < 0) { sellScore++; sellReasons.push("MACD bearish"); }
  if (volSpike) { buyScore++; sellScore++; buyReasons.push("volume spike"); sellReasons.push("volume spike"); }

  const strategy = bot.strategy as string;
  const threshold = strategy === "aggressive" ? 1 : strategy === "conservative" ? 3 : 2;

  let direction: "buy" | "sell" | null = null;
  let score = 0;
  if (buyScore >= threshold && buyScore >= sellScore) { direction = "buy"; score = buyScore; }
  else if (sellScore >= threshold) { direction = "sell"; score = sellScore; }

  if (!direction) {
    await log(botId, userId, "info", `[${hhmmss()}] ⏸ HOLD — Buy ${buyScore}/4 · Sell ${sellScore}/4 (need ${threshold}). No trade.`);
    return;
  }

  // 4) Open trade.
  const scalp = isScalp(timeframe);
  const slPct = Number(bot.sl_pct) / 100;
  const tpPct = Number(bot.tp_pct) / 100;
  const entry = price;
  const slPrice = direction === "buy" ? entry * (1 - slPct) : entry * (1 + slPct);
  const tpPrice = direction === "buy" ? entry * (1 + tpPct) : entry * (1 - tpPct);
  const reasons = (direction === "buy" ? buyReasons : sellReasons).join(", ") || "signal threshold met";

  // VOLATILITY LOT SIZING — full lot on HIGH, half lot on MEDIUM.
  const baseAmount = Number(bot.amount);
  const tradeAmount = +(baseAmount * vol.lotMult).toFixed(2);
  if (vol.lotMult < 1) {
    await log(botId, userId, "info",
      `[${hhmmss()}] 🟡 ${vol.level} volatility → lot size ${Math.round(vol.lotMult * 100)}% ($${baseAmount.toFixed(2)} → $${tradeAmount.toFixed(2)})`);
  }

  await log(botId, userId, "signal",
    `[${hhmmss()}] ✅ ${scalp ? "SCALP " : ""}Signal: ${direction.toUpperCase()} (Score ${score}/4) — Opening trade`);
  const { error: insErr } = await admin.from("bot_trades").insert({
    bot_id: botId, user_id: userId, symbol, direction,
    entry_price: +entry.toFixed(4), sl_price: +slPrice.toFixed(4), tp_price: +tpPrice.toFixed(4),
    amount: tradeAmount, status: "open",
  });
  if (insErr) {
    // Unique index (one open trade per bot) — another concurrent run already
    // opened the position. Skip silently to avoid stacking trades.
    if (insErr.code === "23505") return;
    await log(botId, userId, "info", `[${hhmmss()}] ⚠️ Could not open trade: ${insErr.message}`);
    return;
  }
  // 📍 Entry price + reason  🎯 TP  ⚠️ SL  📊 Score
  await log(botId, userId, "info",
    `[${hhmmss()}] 📍 Entry ${direction.toUpperCase()} @ $${fmt(entry, symbol)} — triggered by: ${reasons}`);
  await log(botId, userId, "info",
    `[${hhmmss()}] 🎯 TP target set @ $${fmt(tpPrice, symbol)} (+${Number(bot.tp_pct)}%)`);
  await log(botId, userId, "info",
    `[${hhmmss()}] ⚠️ SL set @ $${fmt(slPrice, symbol)} (-${Number(bot.sl_pct)}%)`);
  await log(botId, userId, "info",
    `[${hhmmss()}] 📊 Score ${score}/4 triggered the trade${scalp ? " · ⚡ Scalp mode: exits on minimum profit" : ""}`);

  // A trade opened → the bot is active, clear any pause banner.
  await clearPauseReason(bot);

  // 🔔 Notify the user a new trade was opened.
  const botName = (bot.name as string) || symbol;
  await notify(
    userId, botId, "trade_open",
    `📈 ${botName} — Trade Opened`,
    `${direction.toUpperCase()} ${symbol} @ $${fmt(entry, symbol)} · SL $${fmt(slPrice, symbol)} · TP $${fmt(tpPrice, symbol)}`,
  );
}

// ───────────────────── HTTP ─────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron sends none */ }
  const action = (body.action as string) || "tick";
  const botId = body.botId as string | undefined;

  // Public: live volatility snapshot for a symbol (powers the UI meter).
  if (action === "volatility") {
    const symbol = (body.symbol as string) || "XAU/USD";
    const timeframe = (body.timeframe as string) || "5m";
    const price = await getPrice(symbol);
    if (!price) {
      return new Response(JSON.stringify({ error: "price unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const candles = await getCandles(symbol, timeframe, price);
    const v = assessVolatility(price, candles);
    // Continuous 0-100 gauge value, driven mainly by movement (the real
    // volatility), with the realistic spread as a small modifier.
    const percent = volatilityPercent(v, price);
    return new Response(JSON.stringify({
      symbol, price, level: v.level, spread: v.spread, avgMove: v.avgMove,
      spreadMax: v.spreadMax, moveLow: v.moveLow, moveHigh: v.moveHigh, percent,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Identify caller (optional). User-scoped actions require a valid JWT.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token !== ANON_KEY && token !== SERVICE_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }
  }

  try {
    if ((action === "start" || action === "stop" || action === "close") && botId) {
      if (!userId) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: bot } = await admin.from("bots").select("*").eq("id", botId).eq("user_id", userId).maybeSingle();
      if (!bot) return new Response(JSON.stringify({ error: "Bot not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "start") {
        // Restarting resets the loss streak and clears any auto-pause / pause banner.
        await admin.from("bots").update({ status: "running", last_scan_at: null, consecutive_losses: 0, auto_paused: false, pause_reason: null, pause_reason_at: null }).eq("id", botId);
        await log(botId, userId, "info", `[${hhmmss()}] ▶️ Bot started — scanning ${bot.symbol} on ${bot.timeframe}`);
        await processBot({ ...bot, status: "running", last_scan_at: null, consecutive_losses: 0, auto_paused: false, pause_reason: null, pause_reason_at: null });
      } else if (action === "stop" || action === "close") {
        const { data: openTrade } = await admin.from("bot_trades").select("*").eq("bot_id", botId).eq("status", "open").maybeSingle();
        if (openTrade) {
          const price = (await getPrice(bot.symbol as string)) ?? Number(openTrade.entry_price);
          await closeTrade(bot, openTrade, price, "manual");
        } else {
          await admin.from("bots").update({ status: "idle" }).eq("id", botId);
          await log(botId, userId, "info", `[${hhmmss()}] ⏹ Bot stopped`);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // daily-summary: build today's totals and store ONE notification (idempotent per day).
    if (action === "daily-summary") {
      if (!userId) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { data: existing } = await admin
        .from("bot_notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "daily_summary")
        .gte("created_at", startOfDay.toISOString())
        .limit(1);
      if (existing && existing.length) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: trades } = await admin
        .from("bot_trades")
        .select("pnl, result")
        .eq("user_id", userId)
        .eq("status", "closed")
        .gte("closed_at", startOfDay.toISOString());
      const rows = trades ?? [];
      const total = rows.length;
      const wins = rows.filter((t) => t.result === "win").length;
      const pnl = rows.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
      const winRate = total ? Math.round((wins / total) * 100) : 0;
      if (total > 0) {
        const sign = pnl >= 0 ? "+" : "-";
        await notify(
          userId, null, "daily_summary", "📅 Daily Summary",
          `${total} trades · ${winRate}% win rate · P/L ${sign}$${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          pnl,
        );
      }
      return new Response(JSON.stringify({ ok: true, total, wins, winRate, pnl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // tick: process a single bot (fast, client-triggered) or sweep all active bots (cron).
    if (action === "tick" && botId) {
      const { data: bot } = await admin.from("bots").select("*").eq("id", botId).maybeSingle();
      if (bot) await processBot(bot);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sweep: all running bots OR bots with an open trade still needing monitoring.
    const { data: bots } = await admin
      .from("bots")
      .select("*")
      .or("status.eq.running");
    const { data: openTrades } = await admin.from("bot_trades").select("bot_id").eq("status", "open");
    const openBotIds = new Set((openTrades ?? []).map((t) => t.bot_id));
    const toProcess = new Map<string, Record<string, unknown>>();
    for (const b of bots ?? []) toProcess.set(b.id, b);
    // Also include stopped bots that still have an open trade (edge case safety).
    if (openBotIds.size) {
      const missing = [...openBotIds].filter((id) => !toProcess.has(id));
      if (missing.length) {
        const { data: extra } = await admin.from("bots").select("*").in("id", missing);
        for (const b of extra ?? []) toProcess.set(b.id, b);
      }
    }

    await Promise.all([...toProcess.values()].map((b) => processBot(b).catch((e) => console.error("bot error", b.id, e))));

    return new Response(JSON.stringify({ ok: true, processed: toProcess.size }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("engine error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
