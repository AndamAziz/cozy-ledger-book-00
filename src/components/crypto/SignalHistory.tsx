import { useState } from "react";
import {
  History, Check, X as XIcon, Clock, Hourglass,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSignalJournalDb, SignalAction, SignalEntry } from "@/hooks/useSignalJournalDb";

interface Props {
  storeKey: string;
  action: SignalAction;
  confidence: number;
  price: number;
  decimals: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SignalHistory({ storeKey, decimals }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === "en" || language === "tr" ? en : ku);
  const { entries, recent, accuracy, decidedCount, totalPips, loading, isTracked } =
    useSignalJournalDb(storeKey);
  const [expanded, setExpanded] = useState(false);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const list = expanded ? entries : recent;

  const resultChip = (e: SignalEntry) => {
    if (e.result === "pending") {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#f0b90b]">
          <Clock className="h-3 w-3" /> {bi("چاوەڕێ", "Open")}
        </span>
      );
    }
    if (e.result === "expired") {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#848e9c]">
          <Hourglass className="h-3 w-3" /> {bi("بەسەرچوو", "Expired")}
        </span>
      );
    }
    if (e.result === "correct") {
      const label = e.outcome === "tp2" ? "TP2" : "TP1";
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#0ecb81]">
          <Check className="h-3 w-3" /> {label}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-[#f6465d]">
        <XIcon className="h-3 w-3" /> SL
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] p-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[#f0b90b]" />
        <span className="text-sm font-bold text-white">{bi("سیگناڵە پێشووەکان", "Previous Signals")}</span>
        {decidedCount > 0 && (
          <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[#848e9c]">
            {bi("وردی", "Accuracy")} {accuracy}%
          </span>
        )}
        {decidedCount > 0 && (
          <span
            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ color: totalPips >= 0 ? "#0ecb81" : "#f6465d" }}
          >
            {totalPips >= 0 ? "+" : ""}{Math.round(totalPips)} {bi("پۆینت", "pips")}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-2.5 text-center text-[11px] text-[#848e9c]">
          {bi("بارکردن…", "Loading…")}
        </p>
      ) : !isTracked ? (
        <p className="mt-2.5 text-center text-[11px] text-[#848e9c]">
          {bi("مێژووی سیگناڵ بۆ ئەم ئامرازە بەردەست نییە", "Signal history not tracked for this asset")}
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-2.5 text-center text-[11px] text-[#848e9c]">
          {bi("هێشتا سیگناڵ تۆمار نەکراوە", "No signals recorded yet")}
        </p>
      ) : (
        <>
          <ul className="mt-2.5 space-y-1.5">
            {list.map((e) => {
              const isBuy = e.action === "buy";
              return (
                <li key={e.id} className="rounded-lg border border-white/5 bg-[#0a0e17] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-extrabold uppercase"
                        style={{ color: "#0a0e17", background: isBuy ? "#0ecb81" : "#f6465d" }}
                      >
                        {isBuy ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {isBuy ? bi("کڕین", "Buy") : bi("فرۆشتن", "Sell")}
                      </span>
                      <span className="text-[11px] font-semibold text-white tabular-nums">{e.confidence}%</span>
                    </div>
                    {resultChip(e)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[#848e9c] tabular-nums">
                    <span>
                      @ {fmt(e.entryPrice)}{e.resultPrice != null ? ` → ${fmt(e.resultPrice)}` : ""}
                      {e.pips != null && (e.result === "correct" || e.result === "wrong") ? (
                        <span style={{ color: e.pips >= 0 ? "#0ecb81" : "#f6465d" }}>
                          {" "}({e.pips >= 0 ? "+" : ""}{Math.round(e.pips)})
                        </span>
                      ) : null}
                    </span>
                    <span>{fmtDate(e.time)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {entries.length > recent.length && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-[11px] font-semibold text-[#848e9c] hover:bg-white/5 transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="h-3.5 w-3.5" /> {bi("کەمکردنەوە", "Show less")}</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> {bi("تۆماری تەواو", "Full journal")} ({entries.length})</>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
