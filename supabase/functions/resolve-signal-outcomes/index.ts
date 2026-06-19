// ─────────────────────────────────────────────────────────────────────────────
// resolve-signal-outcomes — authoritative, CANDLE-BASED outcome resolver.
//
// For every recent ai_signals row it fetches M5 OHLC candles that occurred AFTER
// the signal opened and walks them chronologically to find which level
// (SL / TP1 / TP2) was touched FIRST, using candle high/low (intrabar) instead of
// a single price-direction snapshot. It then persists the precise `outcome`,
// `status`, `result_pips`, `close_price`, `closed_at`, `resolved_by='candle'`.
//
// Returns an OLD vs NEW comparison (win-rate + total P&L). Pass { "dryRun": true }
// to compute the comparison WITHOUT writing to the database.
//
// Self-contained (edge functions bundle in isolation — no cross-folder imports).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

// ───────────────── candle-based first-touch resolver ─────────────────
interface Candle { time: number; high: number; low: number; close: number; }
type Outcome = "tp1" | "tp2" | "sl" | "expired" | "open";
type Side = "BUY" | "SELL";

interface ResolveResult { outcome: Outcome; exitPrice: number; closedAtMs: number | null; stage: 0 | 1 | 2; }

function resolveOutcome(opts: {
  side: Side; entry: number; sl: number; tp1: number; tp2: number;
  candles: Candle[]; openedAtMs: number;
}): ResolveResult {
  const { side, entry, sl, tp1, tp2, openedAtMs } = opts;
  const isBuy = side === "BUY";
  const after = opts.candles
    .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low))
    .filter((c) => c.time * 1000 >= openedAtMs - 60_000)
    .sort((a, b) => a.time - b.time);

  if (!after.length) return { outcome: "open", exitPrice: entry, closedAtMs: null, stage: 0 };

  let tp1Locked = false;
  for (const c of after) {
    const tMs = c.time * 1000;
    const slHit = isBuy ? c.low <= sl : c.high >= sl;
    const tp1Hit = isBuy ? c.high >= tp1 : c.low <= tp1;
    const tp2Hit = isBuy ? c.high >= tp2 : c.low <= tp2;
    if (!tp1Locked) {
      if (slHit) return { outcome: "sl", exitPrice: sl, closedAtMs: tMs, stage: 0 };
      if (tp2Hit) return { outcome: "tp2", exitPrice: tp2, closedAtMs: tMs, stage: 2 };
      if (tp1Hit) { tp1Locked = true; continue; }
    } else {
      if (tp2Hit) return { outcome: "tp2", exitPrice: tp2, closedAtMs: tMs, stage: 2 };
      if (slHit) return { outcome: "tp1", exitPrice: tp1, closedAtMs: tMs, stage: 1 };
    }
  }
  const last = after[after.length - 1];
  if (tp1Locked) return { outcome: "tp1", exitPrice: tp1, closedAtMs: last.time * 1000, stage: 1 };
  return { outcome: "expired", exitPrice: last.close, closedAtMs: last.time * 1000, stage: 0 };
}

function outcomePips(res: ResolveResult, side: Side, entry: number, pip: number): number {
  const move = side === "BUY" ? res.exitPrice - entry : entry - res.exitPrice;
  const sign = res.outcome === "sl" ? -1 : move >= 0 ? 1 : -1;
  return sign * Math.round(Math.abs(move) / pip);
}
const outcomeToStatus = (o: Outcome) =>
  o === "tp1" || o === "tp2" ? "target_hit" : o === "sl" ? "stopped_out" : o === "expired" ? "expired" : "open";
const isDecisive = (o: Outcome) => o === "tp1" || o === "tp2" || o === "sl";

// ───────────────── M5 candle fetchers (same sources as the app) ─────────────────
async function fetchKrakenM5(): Promise<Candle[]> {
  try {
    const since = Math.floor(Date.now() / 1000) - 300 * 5 * 60;
    const url = `https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=5&since=${since}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error?.length) return [];
    const key = Object.keys(data.result).find((k) => k !== "last");
    if (!key) return [];
    return data.result[key].map((c: number[]) => ({
      time: c[0], high: +c[2], low: +c[3], close: +c[4],
    }));
  } catch { return []; }
}

async function fetchGoldM5(): Promise<Candle[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/commodities-prices?mode=history&code=XAU&range=5min`, {
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON }, signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.candles)) return [];
    return data.candles.map((c: { time: number; high: number; low: number; close: number }) => ({
      time: c.time, high: c.high, low: c.low, close: c.close,
    }));
  } catch { return []; }
}

async function fetchOilM5(): Promise<Candle[]> {
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=5m&range=5d", {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    const r = data?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0];
    if (!ts.length || !q) return [];
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([h, l, c].some((v) => v == null || !Number.isFinite(v))) continue;
      out.push({ time: ts[i], high: h, low: l, close: c });
    }
    return out;
  } catch { return []; }
}

const META: Record<string, { pip: number; decimals: number }> = {
  GOLD: { pip: 0.1, decimals: 2 },
  OIL: { pip: 0.01, decimals: 2 },
  BITCOIN: { pip: 1, decimals: 0 },
};

interface Row {
  id: string; asset: string; signal: string;
  entry: number | null; tp: number | null; tp2: number | null; sl: number | null;
  status: string; outcome: string | null; result_pips: number | null; created_at: string;
}

const winRate = (won: number, lost: number) => (won + lost ? Math.round((won / (won + lost)) * 100) : 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const sinceHours = Number(body?.sinceHours) > 0 ? Number(body.sinceHours) : 48;
    const sinceIso = new Date(Date.now() - sinceHours * 3_600_000).toISOString();

    const { data, error } = await admin
      .from("ai_signals")
      .select("id, asset, signal, entry, tp, tp2, sl, status, outcome, result_pips, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    const [gold, btc, oil] = await Promise.all([fetchGoldM5(), fetchKrakenM5(), fetchOilM5()]);
    const candlesByAsset: Record<string, Candle[]> = { GOLD: gold, BITCOIN: btc, OIL: oil };

    const old = { won: 0, lost: 0, openOrOther: 0, pips: 0 };
    const neu = { tp1: 0, tp2: 0, sl: 0, expired: 0, open: 0, pips: 0 };
    const samples: Record<string, unknown>[] = [];
    let updated = 0;

    for (const r of rows) {
      const meta = META[r.asset];
      const side = (r.signal === "BUY" ? "BUY" : "SELL") as Side;

      if (r.status === "target_hit") old.won++;
      else if (r.status === "stopped_out") old.lost++;
      else old.openOrOther++;
      old.pips += Number(r.result_pips) || 0;

      const candles = candlesByAsset[r.asset] ?? [];
      const entry = Number(r.entry);
      const sl = Number(r.sl);
      const tp1 = Number(r.tp);
      const tp2 = Number(r.tp2) || entry + 2 * (tp1 - entry);

      if (!meta || !candles.length || !Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp1)) {
        neu.open++;
        continue;
      }

      const res = resolveOutcome({ side, entry, sl, tp1, tp2, candles, openedAtMs: new Date(r.created_at).getTime() });
      const pips = res.outcome === "open" ? 0 : outcomePips(res, side, entry, meta.pip);

      if (res.outcome === "tp1") neu.tp1++;
      else if (res.outcome === "tp2") neu.tp2++;
      else if (res.outcome === "sl") neu.sl++;
      else if (res.outcome === "expired") neu.expired++;
      else neu.open++;
      neu.pips += pips;

      if (samples.length < 15 && (isDecisive(res.outcome) || res.outcome === "expired")) {
        samples.push({
          id: r.id, asset: r.asset, side, entry, sl, tp1, tp2: +tp2.toFixed(meta.decimals),
          old: { status: r.status, pips: Number(r.result_pips) || 0 },
          new: { outcome: res.outcome, exit: +res.exitPrice.toFixed(meta.decimals), pips },
        });
      }

      if (!dryRun && res.outcome !== "open") {
        const tp2Pips = outcomePips({ outcome: "tp2", exitPrice: tp2, closedAtMs: null, stage: 2 }, side, entry, meta.pip);
        const { error: upErr } = await admin.from("ai_signals").update({
          outcome: res.outcome,
          status: outcomeToStatus(res.outcome),
          result_pips: pips,
          close_price: +res.exitPrice.toFixed(meta.decimals),
          close_reason: res.outcome === "expired" ? "expired" : res.outcome,
          closed_at: res.closedAtMs ? new Date(res.closedAtMs).toISOString() : new Date().toISOString(),
          tp2: +tp2.toFixed(meta.decimals),
          tp2_pips: tp2Pips,
          resolved_by: "candle",
        }).eq("id", r.id);
        if (!upErr) updated++;
      }
    }

    const result = {
      ok: true, dryRun, sinceHours,
      signalsExamined: rows.length, updated,
      candleCoverage: { GOLD: gold.length, BITCOIN: btc.length, OIL: oil.length },
      comparison: {
        old: {
          method: "legacy tick / price-direction snapshot",
          won: old.won, lost: old.lost, openOrUnresolved: old.openOrOther,
          winRate: winRate(old.won, old.lost), totalPips: old.pips,
        },
        new: {
          method: "candle high/low first-touch (TP1 1.5R / TP2 3R / SL)",
          tp1Wins: neu.tp1, tp2Wins: neu.tp2, slLosses: neu.sl,
          expired: neu.expired, stillOpen: neu.open,
          winRate: winRate(neu.tp1 + neu.tp2, neu.sl), totalPips: neu.pips,
        },
      },
      samples,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
