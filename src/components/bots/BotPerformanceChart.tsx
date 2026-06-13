import { useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { BotPerformance } from "@/hooks/useBots";
import { fmtUsd } from "@/lib/botAssets";
import { cn } from "@/lib/utils";

type Tab = "pnl" | "winrate";

export function BotPerformanceChart({ perf }: { perf: BotPerformance | null }) {
  const [tab, setTab] = useState<Tab>("pnl");

  if (!perf || perf.totalTrades === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="text-sm font-semibold text-foreground">📈 Performance</div>
        <div className="py-8 text-center text-sm text-muted-foreground">
          No closed trades yet. Stats appear here once the bot completes trades.
        </div>
      </div>
    );
  }

  const positive = perf.totalPnl >= 0;

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">📈 Performance</div>
        <div className="flex rounded-lg bg-secondary p-0.5 text-xs">
          <button
            onClick={() => setTab("pnl")}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors",
              tab === "pnl" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Cumulative P/L
          </button>
          <button
            onClick={() => setTab("winrate")}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors",
              tab === "winrate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Win Rate
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Total P/L" value={`${positive ? "+" : "-"}$${fmtUsd(Math.abs(perf.totalPnl))}`} valueClass={positive ? "text-success" : "text-destructive"} />
        <Stat label="Win Rate" value={`${perf.winRate}%`} />
        <Stat label="Best" value={`+$${fmtUsd(Math.max(0, perf.bestTrade))}`} valueClass="text-success" />
        <Stat label="Worst" value={`-$${fmtUsd(Math.abs(Math.min(0, perf.worstTrade)))}`} valueClass="text-destructive" />
      </div>

      {/* Chart */}
      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {tab === "pnl" ? (
            <AreaChart data={perf.points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={positive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={positive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="index" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={42} />
              <Tooltip content={<PnlTooltip />} />
              <Area type="monotone" dataKey="cumulative" stroke={positive ? "hsl(var(--success))" : "hsl(var(--destructive))"} strokeWidth={2} fill="url(#pnlFill)" />
            </AreaChart>
          ) : (
            <LineChart data={perf.points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="index" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={42} unit="%" />
              <Tooltip content={<WinTooltip />} />
              <Line type="monotone" dataKey="winRate" stroke="hsl(var(--gold))" strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-center text-[11px] text-muted-foreground">
        Across {perf.totalTrades} closed trade{perf.totalTrades === 1 ? "" : "s"} · {perf.wins}W / {perf.losses}L · avg {perf.avgPnl >= 0 ? "+" : "-"}${fmtUsd(Math.abs(perf.avgPnl))}
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums text-foreground", valueClass)}>{value}</div>
    </div>
  );
}

function PnlTooltip({ active, payload }: { active?: boolean; payload?: { payload: { index: number; cumulative: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-muted-foreground">Trade #{p.index}</div>
      <div className={cn("font-bold tabular-nums", p.cumulative >= 0 ? "text-success" : "text-destructive")}>
        {p.cumulative >= 0 ? "+" : "-"}${fmtUsd(Math.abs(p.cumulative))}
      </div>
    </div>
  );
}

function WinTooltip({ active, payload }: { active?: boolean; payload?: { payload: { index: number; winRate: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-muted-foreground">Trade #{p.index}</div>
      <div className="font-bold tabular-nums text-gold">{p.winRate}% win rate</div>
    </div>
  );
}
