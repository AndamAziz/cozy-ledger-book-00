import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SignalAction = "buy" | "sell" | "wait";
export type SignalOutcome = "tp1" | "tp2" | "sl" | "expired" | "open";

export interface SignalEntry {
  id: string;
  time: number; // ms epoch
  action: "buy" | "sell";
  confidence: number;
  entryPrice: number;
  result: "correct" | "wrong" | "pending" | "expired";
  resultPrice?: number;
  outcome: SignalOutcome;
  pips?: number;
}

const MAX = 40;

/**
 * Map a Pro-panel store key to the canonical DB asset used in `ai_signals`.
 * Returns null when there is no DB-tracked asset (e.g. individual forex pairs),
 * in which case the widget shows the empty state instead of inventing numbers.
 */
export function storeKeyToAsset(storeKey: string): string | null {
  const k = storeKey.toUpperCase();
  if (k.includes("XAU") || k.includes("GOLD")) return "GOLD";
  if (k.includes("BTC") || k.includes("BITCOIN")) return "BITCOIN";
  if (k.includes("OIL") || k.includes("WTI") || k.includes("USOIL")) return "OIL";
  return null;
}

function outcomeToResult(outcome: SignalOutcome): SignalEntry["result"] {
  switch (outcome) {
    case "tp1":
    case "tp2":
      return "correct";
    case "sl":
      return "wrong";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}

interface Row {
  id: string;
  signal: string | null;
  entry: number | null;
  confidence: number | null;
  outcome: string | null;
  result_pips: number | null;
  close_price: number | null;
  created_at: string;
}

function mapRow(r: Row): SignalEntry {
  const action: "buy" | "sell" = (r.signal || "").toLowerCase() === "sell" ? "sell" : "buy";
  const outcome = (r.outcome as SignalOutcome) || "open";
  return {
    id: r.id,
    time: new Date(r.created_at).getTime(),
    action,
    confidence: Math.round(r.confidence ?? 0),
    entryPrice: Number(r.entry ?? 0),
    result: outcomeToResult(outcome),
    resultPrice: r.close_price != null ? Number(r.close_price) : undefined,
    outcome,
    pips: r.result_pips != null ? Number(r.result_pips) : undefined,
  };
}

/**
 * DB-backed signal journal — single source of truth shared with Telegram reports.
 * Reads canonical, candle-resolved outcomes from `ai_signals` for the asset that
 * `storeKey` maps to. Auto-refreshes via realtime so accuracy stays in sync.
 */
export function useSignalJournalDb(storeKey: string) {
  const asset = storeKeyToAsset(storeKey);
  const [entries, setEntries] = useState<SignalEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(!!asset);

  const load = useCallback(async () => {
    if (!asset) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("ai_signals")
      .select("id, signal, entry, confidence, outcome, result_pips, close_price, created_at")
      .eq("asset", asset)
      .order("created_at", { ascending: false })
      .limit(MAX);
    if (!error && data) {
      setEntries((data as Row[]).map(mapRow));
    }
    setLoading(false);
  }, [asset]);

  useEffect(() => {
    setLoading(!!asset);
    load();
    if (!asset) return;
    const channel = supabase
      .channel(`ai_signals_${asset}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_signals", filter: `asset=eq.${asset}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [asset, load]);

  // "Decided" = a TP/SL outcome. Expired and open are excluded from the win rate
  // so this matches the Telegram report's accuracy calculation exactly.
  const decided = entries.filter((e) => e.result === "correct" || e.result === "wrong");
  const correct = decided.filter((e) => e.result === "correct").length;
  const accuracy = decided.length ? Math.round((correct / decided.length) * 100) : 0;
  const totalPips = decided.reduce((sum, e) => sum + (e.pips ?? 0), 0);

  return {
    entries,
    recent: entries.slice(0, 5),
    accuracy,
    decidedCount: decided.length,
    totalPips,
    loading,
    isTracked: !!asset,
  };
}
