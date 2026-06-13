import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Bot {
  id: string;
  user_id: string;
  name: string;
  symbol: string;
  asset_class: string;
  timeframe: string;
  amount: number;
  sl_pct: number;
  tp_pct: number;
  strategy: "conservative" | "balanced" | "aggressive";
  status: "idle" | "running" | "stopped";
  trades_count: number;
  wins_count: number;
  total_pnl: number;
  last_scan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotTrade {
  id: string;
  bot_id: string;
  symbol: string;
  direction: "buy" | "sell";
  entry_price: number;
  sl_price: number;
  tp_price: number;
  amount: number;
  status: "open" | "closed";
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  result: "win" | "loss" | null;
  close_reason: "tp" | "sl" | "manual" | null;
  opened_at: string;
  closed_at: string | null;
}

export interface BotLog {
  id: string;
  bot_id: string;
  level: string;
  message: string;
  created_at: string;
}

/** List all of the current user's bots, with realtime updates. */
export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("bots")
      .select("*")
      .order("created_at", { ascending: false });
    setBots((data as Bot[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("bots-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "bots" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { bots, loading, refresh: load };
}

/** Load a single bot plus its open trade, recent logs, and last closed trade. */
export function useBotDetail(botId: string | undefined) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [openTrade, setOpenTrade] = useState<BotTrade | null>(null);
  const [lastClosed, setLastClosed] = useState<BotTrade | null>(null);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!botId) return;
    const [botRes, tradeRes, closedRes, logRes] = await Promise.all([
      supabase.from("bots").select("*").eq("id", botId).maybeSingle(),
      supabase.from("bot_trades").select("*").eq("bot_id", botId).eq("status", "open").maybeSingle(),
      supabase.from("bot_trades").select("*").eq("bot_id", botId).eq("status", "closed").order("closed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("bot_logs").select("*").eq("bot_id", botId).order("created_at", { ascending: false }).limit(60),
    ]);
    setBot((botRes.data as Bot) ?? null);
    setOpenTrade((tradeRes.data as BotTrade) ?? null);
    setLastClosed((closedRes.data as BotTrade) ?? null);
    setLogs((logRes.data as BotLog[]) ?? []);
    setLoading(false);
  }, [botId]);

  useEffect(() => {
    load();
    if (!botId) return;
    const ch = supabase
      .channel(`bot-detail-${botId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bots", filter: `id=eq.${botId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_trades", filter: `bot_id=eq.${botId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bot_logs", filter: `bot_id=eq.${botId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [botId, load]);

  return { bot, openTrade, lastClosed, logs, loading, refresh: load };
}

/** The shared demo balance (reused from demo_accounts), with realtime updates. */
export function useDemoBalance() {
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("demo_accounts")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setBalance(Number(data.balance));
    else {
      await supabase.from("demo_accounts").insert({ user_id: user.id, balance: 5000, starting_balance: 5000, realized_pnl: 0 });
      setBalance(5000);
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("demo-balance")
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_accounts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { balance, refresh: load };
}

export interface PerfPoint {
  index: number;          // trade number (1-based)
  time: string;           // closed_at ISO
  pnl: number;            // this trade's P/L
  cumulative: number;     // running cumulative P/L
  winRate: number;        // rolling win rate (%) up to this trade
}

export interface BotPerformance {
  points: PerfPoint[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  bestTrade: number;
  worstTrade: number;
  avgPnl: number;
}

/** Per-bot performance history: cumulative P/L and win rate over time. */
export function useBotPerformance(botId: string | undefined) {
  const [perf, setPerf] = useState<BotPerformance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!botId) return;
    const { data } = await supabase
      .from("bot_trades")
      .select("pnl, result, closed_at")
      .eq("bot_id", botId)
      .eq("status", "closed")
      .order("closed_at", { ascending: true });

    const rows = (data as { pnl: number | null; result: string | null; closed_at: string | null }[]) ?? [];
    let cumulative = 0;
    let wins = 0;
    let best = -Infinity;
    let worst = Infinity;
    const points: PerfPoint[] = rows.map((r, i) => {
      const pnl = Number(r.pnl ?? 0);
      cumulative += pnl;
      if (r.result === "win") wins++;
      best = Math.max(best, pnl);
      worst = Math.min(worst, pnl);
      return {
        index: i + 1,
        time: r.closed_at ?? "",
        pnl,
        cumulative: +cumulative.toFixed(2),
        winRate: +(((wins / (i + 1)) * 100)).toFixed(1),
      };
    });

    const totalTrades = rows.length;
    setPerf({
      points,
      totalTrades,
      wins,
      losses: totalTrades - wins,
      winRate: totalTrades ? +((wins / totalTrades) * 100).toFixed(1) : 0,
      totalPnl: +cumulative.toFixed(2),
      bestTrade: totalTrades ? +best.toFixed(2) : 0,
      worstTrade: totalTrades ? +worst.toFixed(2) : 0,
      avgPnl: totalTrades ? +(cumulative / totalTrades).toFixed(2) : 0,
    });
    setLoading(false);
  }, [botId]);

  useEffect(() => {
    load();
    if (!botId) return;
    const ch = supabase
      .channel(`bot-perf-${botId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_trades", filter: `bot_id=eq.${botId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [botId, load]);

  return { perf, loading, refresh: load };
}
