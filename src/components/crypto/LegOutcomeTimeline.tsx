import { useCallback, useEffect, useState } from "react";
import {
  Clock, RefreshCw, Target, ShieldX, Hourglass, TrendingUp, TrendingDown,
  Layers, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

// Per-timeframe outcome timeline. Each row in ai_signals that carries a
// `timeframe` is one cascade leg (5M/15M/30M/1H) sent to Telegram. This view
// shows when each leg went live and how/when it closed: TP, SL, or period close.

interface LegRow {
  id: string;
  asset: string;
  timeframe: string | null;
  signal: string;
  entry: number | null;
  close_price: number | null;
  result_pips: number | null;
  status: string;
  close_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

const ASSET_DECIMALS: Record<string, number> = { GOLD: 2, OIL: 2, BITCOIN: 0 };
const ASSET_EMOJI: Record<string, string> = { GOLD: "🥇", OIL: "🛢", BITCOIN: "₿" };
const TF_ORDER = ["5M", "15M", "30M", "1H"];

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDay(iso: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
}
function durationLabel(from: string, to: string | null): string {
  if (!to) return "";
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function LegOutcomeTimeline() {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === "en" || language === "tr" ? en : ku);

  const [rows, setRows] = useState<LegRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_signals")
      .select("id, asset, timeframe, signal, entry, close_price, result_pips, status, close_reason, created_at, closed_at")
      .not("timeframe", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    setRows((data ?? []) as LegRow[]);
    setLoading(false);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = expanded ? rows : rows.slice(0, 8);

  const fmtPrice = (asset: string, v: number | null) => {
    if (v == null) return "—";
    const d = ASSET_DECIMALS[asset] ?? 2;
    return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  const closeChip = (r: LegRow) => {
    if (!r.closed_at) {
      return (
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#f0b90b] bg-[#f0b90b14]">
          <Clock className="h-3 w-3" /> {bi("کراوە", "Open")}
        </span>
      );
    }
    if (r.close_reason === "tp") {
      return (
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0ecb81] bg-[#0ecb8114]">
          <Target className="h-3 w-3" /> {bi("مەبەست", "TP hit")}
        </span>
      );
    }
    if (r.close_reason === "sl") {
      return (
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#f6465d] bg-[#f6465d14]">
          <ShieldX className="h-3 w-3" /> {bi("ستۆپ", "SL hit")}
        </span>
      );
    }
    // period_close (or legacy rows with no reason)
    const win = (r.result_pips ?? 0) >= 0;
    return (
      <span
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
        style={{ color: win ? "#0ecb81" : "#f6465d", background: win ? "#0ecb8114" : "#f6465d14" }}
      >
        <Hourglass className="h-3 w-3" /> {bi("کۆتایی کات", "Period close")}
      </span>
    );
  };

  return (
    <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#f0b90b]" />
        <div className="flex-1">
          <h2 className="text-sm font-bold text-white">{bi("کاتی ئەنجامی هەر چوارچێوەیەک", "Per-timeframe Outcome Timeline")}</h2>
          <p className="text-[10px] text-[#848e9c]">
            {bi("کەی هەر لای ٥M/١٥M/٣٠M/١H نێردرا و کەی داخرا", "When each 5M/15M/30M/1H leg was sent & how it closed")}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="rounded-lg bg-[#1a1e2e] hover:bg-[#252a3a] p-2 text-[#f0b90b] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loaded && rows.length === 0 ? (
        <p className="mt-3 text-center text-[11px] text-[#848e9c]">
          {bi("هێشتا هیچ لایەکی چوارچێوە نەنێردراوە", "No timeframe legs sent yet")}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {visible.map((r) => {
              const isBuy = r.signal === "BUY";
              const pips = r.result_pips;
              return (
                <li key={r.id} className="rounded-lg border border-white/5 bg-[#0a0e17] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm leading-none">{ASSET_EMOJI[r.asset] ?? "📊"}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        {r.timeframe}
                      </span>
                      <span
                        className="flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-extrabold uppercase"
                        style={{ color: "#0a0e17", background: isBuy ? "#0ecb81" : "#f6465d" }}
                      >
                        {isBuy ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {isBuy ? bi("کڕین", "Buy") : bi("فرۆشتن", "Sell")}
                      </span>
                    </div>
                    {closeChip(r)}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#848e9c] tabular-nums">
                    <span className="flex items-center gap-1">
                      <span className="text-[#5b6472]">{bi("نێردرا", "Sent")}</span>
                      {fmtDay(r.created_at)} {fmtTime(r.created_at)}
                    </span>
                    <span>@ {fmtPrice(r.asset, r.entry)}</span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-[#848e9c] tabular-nums">
                    <span className="flex items-center gap-1">
                      <span className="text-[#5b6472]">{bi("داخرا", "Closed")}</span>
                      {r.closed_at ? `${fmtTime(r.closed_at)}` : "—"}
                      {r.closed_at && (
                        <span className="text-[#5b6472]">({durationLabel(r.created_at, r.closed_at)})</span>
                      )}
                    </span>
                    {pips != null && r.closed_at ? (
                      <span className="font-bold" style={{ color: pips >= 0 ? "#0ecb81" : "#f6465d" }}>
                        {pips >= 0 ? "+" : ""}{pips} {bi("پیپ", "pips")} → {fmtPrice(r.asset, r.close_price)}
                      </span>
                    ) : (
                      <span className="text-[#5b6472]">{bi("چاوەڕێی داخستن", "awaiting close")}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {rows.length > 8 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-[#848e9c] hover:bg-white/5 transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="h-3.5 w-3.5" /> {bi("کەمکردنەوە", "Show less")}</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> {bi("هەمووی", "Show all")} ({rows.length})</>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
