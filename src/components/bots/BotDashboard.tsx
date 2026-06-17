import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtUsd } from "@/lib/botAssets";
import { cn } from "@/lib/utils";
import type { Bot } from "@/hooks/useBots";
import {
  DAILY_LOSS_LIMIT_USD, DAILY_PROFIT_TARGET_USD, NEWS_BLOCK_NEW_MIN,
} from "@/lib/tradingSessions";
import { LayoutDashboard, Activity } from "lucide-react";

interface TradeRow {
  pnl: number | null;
  result: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface NewsEvent { country: string; impact: string; date: string; title: string }

interface DayBar { key: string; label: string; pnl: number }

interface Summary {
  trades: number;
  winRate: number;
  best: number;
  worst: number;
  net: number;
}

const newsHeaders = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

export function BotDashboard({ bots }: { bots: Bot[] }) {
  const [today, setToday] = useState<Summary | null>(null);
  const [week, setWeek] = useState<DayBar[]>([]);
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [now, setNow] = useState(Date.now());

  // Keep countdowns and status fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);

    const { data } = await supabase
      .from("bot_trades")
      .select("pnl, result, opened_at, closed_at")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("closed_at", weekStart.toISOString());
    const rows = (data as TradeRow[]) ?? [];

    // ---- Weekly bars (last 7 local days) ----
    const days: DayBar[] = [];
    const byKey: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      days.push({ key, label, pnl: 0 });
      byKey[key] = days.length - 1;
    }
    for (const r of rows) {
      if (!r.closed_at) continue;
      const key = new Date(r.closed_at).toISOString().slice(0, 10);
      const idx = byKey[key];
      if (idx != null) days[idx].pnl += Number(r.pnl ?? 0);
    }
    days.forEach((d) => (d.pnl = +d.pnl.toFixed(2)));
    setWeek(days);

    // ---- Today's summary ----
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayRows = rows.filter((r) => r.closed_at && new Date(r.closed_at).toISOString().slice(0, 10) === todayKey);
    const pnls = todayRows.map((r) => Number(r.pnl ?? 0));
    const wins = todayRows.filter((r) => r.result === "win").length;
    setToday({
      trades: todayRows.length,
      winRate: todayRows.length ? Math.round((wins / todayRows.length) * 100) : 0,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      net: +pnls.reduce((a, b) => a + b, 0).toFixed(2),
    });
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("bot-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Fetch the economic calendar for the news-blocked state.
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-news`, { headers: newsHeaders });
        const d = await res.json();
        if (Array.isArray(d.events)) setEvents(d.events);
      } catch { /* ignore */ }
    };
    run();
    const id = setInterval(run, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // High-impact USD event within the news-block window?
  const newsBlock = useMemo(() => {
    for (const e of events) {
      if ((e.country || "").toUpperCase() !== "USD") continue;
      if ((e.impact || "").toLowerCase() !== "high") continue;
      const t = Date.parse(e.date);
      if (Number.isNaN(t)) continue;
      const min = (t - now) / 60_000;
      if (min >= 0 && min <= NEWS_BLOCK_NEW_MIN) return { title: e.title, minutes: Math.round(min) };
    }
    return null;
  }, [events, now]);

  const status = useMemo(() => {
    const net = today?.net ?? 0;
    const anyRunning = bots.some((b) => b.status === "running");
    const anyAutoPaused = bots.some((b) => b.auto_paused);

    if (net <= -DAILY_LOSS_LIMIT_USD)
      return { dot: "🔴", text: "Paused", detail: "Daily loss limit reached", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
    if (net >= DAILY_PROFIT_TARGET_USD)
      return { dot: "🔴", text: "Paused", detail: "Daily profit target hit", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
    if (anyAutoPaused)
      return { dot: "🔴", text: "Paused", detail: "Loss streak — auto-paused", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
    if (newsBlock)
      return { dot: "⛔", text: "Blocked", detail: `${newsBlock.title} in ${newsBlock.minutes}min`, cls: "border-orange-500/40 bg-orange-500/10 text-orange-500" };
    if (anyRunning)
      return { dot: "🟢", text: "Trading", detail: "Scanning volatility 24/7", cls: "border-success/40 bg-success/10 text-success" };
    return { dot: "🟡", text: "Waiting", detail: "Bot idle — press start", cls: "border-gold/40 bg-gold/10 text-gold" };
  }, [bots, today, newsBlock]);


  const maxAbs = Math.max(1, ...week.map((d) => Math.abs(d.pnl)));

  return (
    <div className="mt-4 space-y-3">
      {/* Header + status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-gold" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bot Dashboard</span>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", status.cls)}>
          {status.dot} {status.text}
        </span>
      </div>

      {/* Today's summary */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Today's Summary</span>
          <span className="text-[11px] text-muted-foreground">{status.detail}</span>
        </div>
        {today && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-y-3 text-center">
              <Stat label="Trades" value={String(today.trades)} />
              <Stat label="Win Rate" value={`${today.winRate}%`} />
              <Stat
                label="Net P/L"
                value={`${today.net >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(today.net))}`}
                valueClass={today.net >= 0 ? "text-success" : "text-destructive"}
              />
              <Stat label="Best Trade" value={`+$${fmtUsd(Math.max(0, today.best))}`} valueClass="text-success" />
              <Stat label="Worst Trade" value={`-$${fmtUsd(Math.abs(Math.min(0, today.worst)))}`} valueClass="text-destructive" />
              <Stat
                label="Avg/Trade"
                value={`${today.trades && today.net < 0 ? "-" : "+"}$${fmtUsd(today.trades ? Math.abs(today.net / today.trades) : 0)}`}
                valueClass={today.net >= 0 ? "text-success" : "text-destructive"}
              />
            </div>
          </>
        )}
      </div>

      {/* Weekly chart */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weekly P/L (7 days)</span>
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--secondary))" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(v))}`, "P/L"]}
              />
              <Bar dataKey="pnl" radius={[4, 4, 4, 4]} maxBarSize={28}>
                {week.map((d) => (
                  <Cell key={d.key} fill={d.pnl >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 text-center text-[10px] text-muted-foreground">Scale ±${fmtUsd(maxAbs)}</div>
      </div>

      {/* Trading mode */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm text-foreground">
        <Activity className="h-4 w-4 shrink-0 text-success" />
        <span className="font-medium">Trading mode:</span>
        <span className="ml-auto font-semibold">24/7 · volatility-based</span>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("font-bold tabular-nums text-foreground", valueClass)}>{value}</div>
    </div>
  );
}
