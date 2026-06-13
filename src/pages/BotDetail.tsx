import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useBotDetail, useDemoBalance, useBotPerformance } from "@/hooks/useBots";
import { BotPerformanceChart } from "@/components/bots/BotPerformanceChart";
import { useBotPrices, callEngine } from "@/hooks/useBotPrices";
import { getAsset, fmtPrice, fmtUsd } from "@/lib/botAssets";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Play, Square, Trash2, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TF_SECONDS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400 };

function duration(fromSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - fromSec);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bot, openTrade, lastClosed, logs, loading } = useBotDetail(id);
  const { balance } = useDemoBalance();
  const { quotes } = useBotPrices();
  const { perf } = useBotPerformance(id);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  // Re-render every second for live durations / countdown.
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // While the bot is active (running or holding an open trade) and the page is
  // open, nudge the engine every ~6s so TP/SL and new scans react near-instantly
  // (the background cron runs every minute regardless).
  useEffect(() => {
    if (!id || !bot) return;
    if (bot.status !== "running" && !openTrade) return;
    const tick = () => callEngine({ action: "tick", botId: id }).catch(() => {});
    const t = window.setInterval(tick, 6000);
    return () => window.clearInterval(t);
  }, [id, bot?.status, openTrade?.id]);

  const live = bot ? quotes[bot.symbol]?.price ?? null : null;

  const unrealized = useMemo(() => {
    if (!openTrade || live == null) return null;
    const entry = Number(openTrade.entry_price);
    const amount = Number(openTrade.amount);
    const diffPct = openTrade.direction === "buy" ? (live - entry) / entry : (entry - live) / entry;
    return { pnl: diffPct * amount, pct: diffPct * 100 };
  }, [openTrade, live]);

  const countdown = useMemo(() => {
    if (!bot || bot.status !== "running" || openTrade) return null;
    const interval = TF_SECONDS[bot.timeframe] ?? 300;
    const last = bot.last_scan_at ? new Date(bot.last_scan_at).getTime() : Date.now();
    const next = last + interval * 1000;
    const remaining = Math.max(0, Math.round((next - Date.now()) / 1000));
    return { remaining, pct: Math.min(100, 100 - (remaining / interval) * 100) };
  }, [bot, openTrade]);

  if (loading || !bot) {
    return <div className="flex min-h-[100dvh] items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const a = getAsset(bot.symbol);
  const winRate = bot.trades_count > 0 ? Math.round((bot.wins_count / bot.trades_count) * 100) : 0;
  const running = bot.status === "running";

  const handleStartStop = async () => {
    setBusy(true);
    try {
      await callEngine({ action: running ? "stop" : "start", botId: bot.id });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    setBusy(true);
    try {
      await callEngine({ action: "close", botId: bot.id });
      toast({ title: "Trade closed" });
    } catch {
      toast({ title: "Could not close", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    await supabase.from("bots").delete().eq("id", bot.id);
    navigate("/bots");
  };

  const showResult = !openTrade && bot.status !== "running" && lastClosed;

  return (
    <div className="min-h-[100dvh] bg-background">
      <Helmet><title>{bot.name} — Trading Bot</title></Helmet>

      <div className="mx-auto max-w-[430px] px-3 pb-24 pt-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 hover:bg-secondary"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
            <h1 className="text-lg font-bold text-foreground">{bot.name}</h1>
          </div>
          <div className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1.5 text-sm font-bold tabular-nums text-gold">
            💰 ${balance != null ? fmtUsd(balance) : "—"}
          </div>
        </div>

        {/* Bot card */}
        <div className={cn("mt-4 rounded-2xl border bg-card p-4", a.primary ? "border-gold/40" : "border-border")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{a.emoji}</span>
              <div>
                <div className="font-bold text-foreground">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {bot.symbol} · {bot.timeframe} · ${fmtUsd(Number(bot.amount))} · {bot.strategy}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleStartStop}
                disabled={busy}
                className={cn(
                  "font-bold",
                  running ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-gradient-to-r from-gold to-accent text-gold-foreground hover:opacity-90",
                )}
              >
                {running ? <><Square className="mr-1 h-4 w-4" /> Stop</> : <><Play className="mr-1 h-4 w-4" /> Start</>}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this bot?</AlertDialogTitle>
                    <AlertDialogDescription>This removes the bot and its history. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* status + countdown */}
          <div className="mt-3 flex items-center gap-2">
            <span className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              running ? "bg-success/15 text-success" : bot.status === "stopped" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground",
            )}>
              {running ? "● RUNNING" : bot.status === "stopped" ? "■ STOPPED" : "○ IDLE"}
            </span>
            {countdown && (
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">⏱ {countdown.remaining}s</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold to-accent transition-all" style={{ width: `${countdown.pct}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* stats */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Trades</div>
              <div className="font-bold text-foreground">{bot.trades_count}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Win Rate</div>
              <div className="font-bold text-foreground">{winRate}%</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">P/L</div>
              <div className={cn("font-bold tabular-nums", Number(bot.total_pnl) >= 0 ? "text-success" : "text-destructive")}>
                {Number(bot.total_pnl) >= 0 ? "+" : "-"}${fmtUsd(Math.abs(Number(bot.total_pnl)))}
              </div>
            </div>
          </div>
        </div>

        {/* Open trade */}
        {openTrade && (
          <div className={cn(
            "mt-3 rounded-2xl border-2 bg-card p-4",
            (unrealized?.pnl ?? 0) >= 0 ? "border-success/50 shadow-[0_0_24px_-6px] shadow-success/40" : "border-destructive/50 shadow-[0_0_24px_-6px] shadow-destructive/40",
          )}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">📊 OPEN TRADE</span>
              <span className={cn("flex items-center gap-1 text-sm font-bold", openTrade.direction === "buy" ? "text-success" : "text-destructive")}>
                {openTrade.direction === "buy" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {openTrade.direction.toUpperCase()} · {openTrade.symbol}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <div className="text-muted-foreground">Entry: <span className="font-semibold text-foreground tabular-nums">${fmtPrice(Number(openTrade.entry_price), openTrade.symbol)}</span></div>
              <div className="text-muted-foreground text-right">Current: <span className="font-semibold text-foreground tabular-nums">{live != null ? `$${fmtPrice(live, openTrade.symbol)}` : "—"}</span></div>
              <div className="text-destructive">SL: <span className="tabular-nums">${fmtPrice(Number(openTrade.sl_price), openTrade.symbol)}</span></div>
              <div className="text-success text-right">TP: <span className="tabular-nums">${fmtPrice(Number(openTrade.tp_price), openTrade.symbol)}</span></div>
            </div>

            <div className={cn(
              "mt-3 rounded-xl p-3 text-center",
              (unrealized?.pnl ?? 0) >= 0 ? "bg-success/10" : "bg-destructive/10",
            )}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Unrealized P/L</div>
              <div className={cn(
                "mt-0.5 text-2xl font-bold tabular-nums animate-pulse",
                (unrealized?.pnl ?? 0) >= 0 ? "text-success" : "text-destructive",
              )}>
                {unrealized ? `${unrealized.pnl >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(unrealized.pnl))}` : "—"}
                {unrealized && <span className="ml-1 text-sm">({unrealized.pnl >= 0 ? "+" : ""}{unrealized.pct.toFixed(2)}%)</span>}
              </div>
            </div>

            <div className="mt-2 text-center text-xs text-muted-foreground">
              ⏳ Open for {duration(Math.floor(new Date(openTrade.opened_at).getTime() / 1000))}
            </div>

            <Button onClick={handleClose} disabled={busy} variant="secondary" className="mt-3 w-full">
              Close Trade Now
            </Button>
          </div>
        )}

        {/* Result card */}
        {showResult && lastClosed && (
          <div className={cn(
            "mt-3 rounded-2xl border-2 bg-card p-4",
            lastClosed.result === "win" ? "border-success/60 shadow-[0_0_28px_-6px] shadow-success/50" : "border-destructive/60 shadow-[0_0_28px_-6px] shadow-destructive/50",
          )}>
            <div className={cn("text-center text-base font-bold", lastClosed.result === "win" ? "text-success" : "text-destructive")}>
              {lastClosed.result === "win" ? "✅ TRADE CLOSED — WIN 🏆" : "❌ TRADE CLOSED — LOSS"}
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <Row label="Asset" value={lastClosed.symbol} />
              <Row label="Direction" value={lastClosed.direction.toUpperCase()} />
              <Row label="Entry" value={`$${fmtPrice(Number(lastClosed.entry_price), lastClosed.symbol)}`} />
              <Row label="Exit" value={`$${fmtPrice(Number(lastClosed.exit_price ?? 0), lastClosed.symbol)}${lastClosed.close_reason === "sl" ? " (SL hit)" : lastClosed.close_reason === "tp" ? " (TP hit)" : ""}`} />
              <Row
                label={lastClosed.result === "win" ? "Profit" : "Loss"}
                value={`${(lastClosed.pnl ?? 0) >= 0 ? "+" : "-"}$${fmtUsd(Math.abs(Number(lastClosed.pnl ?? 0)))} (${(lastClosed.pnl ?? 0) >= 0 ? "+" : ""}${Number(lastClosed.pnl_pct ?? 0).toFixed(2)}%)`}
                valueClass={lastClosed.result === "win" ? "text-success" : "text-destructive"}
              />
            </div>
            <div className="mt-3 border-t border-border pt-2 text-center text-sm text-muted-foreground">
              Demo Balance: <span className="font-semibold text-foreground">${balance != null ? fmtUsd(balance) : "—"}</span>
              <span className="mx-1">·</span>
              {bot.trades_count} trades · {winRate}% win
            </div>
            <Button onClick={handleStartStop} disabled={busy} className="mt-3 w-full bg-gradient-to-r from-gold to-accent text-gold-foreground font-bold hover:opacity-90">
              <Play className="mr-1 h-4 w-4" /> Start New Trade
            </Button>
          </div>
        )}

        {/* Performance analytics */}
        <BotPerformanceChart perf={perf} />

        {/* Logs */}
        <div className="mt-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">📋 Bot Logs</span>
            <span className="text-xs text-muted-foreground">{logs.length} entries</span>
          </div>
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">No activity yet.</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className={cn(
                  l.level === "win" ? "text-success" : l.level === "loss" ? "text-destructive" : l.level === "signal" ? "text-gold" : l.level === "advice" ? "text-foreground" : "text-muted-foreground",
                )}>
                  {l.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums text-foreground", valueClass)}>{value}</span>
    </div>
  );
}
