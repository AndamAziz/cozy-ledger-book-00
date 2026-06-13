import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd } from "@/lib/botAssets";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

interface DayStats {
  trades: number;
  wins: number;
  winRate: number;
  pnl: number;
}

/** End-of-day style card: total trades, win rate and P/L for today (all bots). */
export function DailySummary() {
  const [stats, setStats] = useState<DayStats | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("bot_trades")
      .select("pnl, result")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("closed_at", start.toISOString());
    const rows = (data as { pnl: number | null; result: string | null }[]) ?? [];
    const trades = rows.length;
    const wins = rows.filter((r) => r.result === "win").length;
    const pnl = rows.reduce((a, r) => a + Number(r.pnl ?? 0), 0);
    setStats({ trades, wins, winRate: trades ? Math.round((wins / trades) * 100) : 0, pnl: +pnl.toFixed(2) });
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("daily-summary")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (!stats) return null;

  const sign = stats.pnl >= 0 ? "+" : "-";

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-gold" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's Summary</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Trades</div>
          <div className="font-bold text-foreground tabular-nums">{stats.trades}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Win Rate</div>
          <div className="font-bold text-foreground tabular-nums">{stats.winRate}%</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">P/L</div>
          <div className={cn("font-bold tabular-nums", stats.pnl >= 0 ? "text-success" : "text-destructive")}>
            {sign}${fmtUsd(Math.abs(stats.pnl))}
          </div>
        </div>
      </div>
    </div>
  );
}
