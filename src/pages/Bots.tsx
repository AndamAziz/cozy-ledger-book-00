import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useBots, useDemoBalance } from "@/hooks/useBots";
import { useBotPrices } from "@/hooks/useBotPrices";
import { MarketDropdown } from "@/components/bots/MarketDropdown";
import { PriceDetailModal } from "@/components/bots/PriceDetailModal";
import { CreateBotModal } from "@/components/bots/CreateBotModal";
import { NotificationBell } from "@/components/bots/NotificationBell";
import { BotDashboard } from "@/components/bots/BotDashboard";
import { goToGold } from "@/lib/botNav";
import { getAsset, fmtPrice, fmtUsd } from "@/lib/botAssets";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight, ArrowLeft, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Bots() {
  const navigate = useNavigate();
  const { bots, loading } = useBots();
  const { balance } = useDemoBalance();
  const { quotes, history, updatedAt } = useBotPrices();
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const updatedAgo = useMemo(() => {
    if (!updatedAt) return "…";
    const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    return `${s}s ago`;
  }, [updatedAt, quotes]);

  if (authed === false) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-foreground">Please sign in to use Trading Bots.</p>
        <Link to="/"><Button>Go to sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background safe-area-inset overflow-x-hidden">
      <Helmet>
        <title>Trading Bots — AI Gold, Crypto & Forex</title>
        <meta name="description" content="Create AI trading bots for Gold, Crypto and Forex with live demo balance, auto take-profit and stop-loss." />
      </Helmet>

      <div className="mx-auto min-w-0 max-w-[430px] px-3 pb-24 pt-3 safe-area-top">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToGold(navigate)}
              className="rounded-lg p-1.5 hover:bg-secondary"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-accent">
              <LineChart className="h-5 w-5 text-gold-foreground" />
            </div>
            <div>
              <div className="text-base font-bold leading-tight text-foreground">GoldTrade</div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Realtime
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1.5 text-sm font-bold tabular-nums text-gold">
              💰 ${balance != null ? fmtUsd(balance) : "—"}
            </div>
          </div>
        </div>

        {/* Bot dashboard */}
        <BotDashboard bots={bots} />

        {/* Live markets */}
        <div className="mt-4">
          <MarketDropdown
            quotes={quotes}
            updatedLabel={`Updated ${updatedAgo} · every 2s`}
            onSelect={setDetailSymbol}
          />
        </div>

        {/* Your bots */}
        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Bots</h2>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="bg-gradient-to-r from-gold to-accent text-gold-foreground font-bold hover:opacity-90"
          >
            <Plus className="mr-1 h-4 w-4" /> New Bot
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Loading…</div>
          ) : bots.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <div className="text-4xl">🤖</div>
              <div className="mt-2 font-semibold text-foreground">No bots yet</div>
              <div className="mt-1 text-sm text-muted-foreground">Create your first bot to start trading.</div>
              <Button
                onClick={() => setCreateOpen(true)}
                className="mt-4 bg-gradient-to-r from-gold to-accent text-gold-foreground font-bold hover:opacity-90"
              >
                <Plus className="mr-1 h-4 w-4" /> Create Bot
              </Button>
            </div>
          ) : (
            bots.map((bot) => {
              const a = getAsset(bot.symbol);
              const q = quotes[bot.symbol];
              const running = bot.status === "running";
              return (
                <button
                  key={bot.id}
                  onClick={() => navigate(`/bots/${bot.id}`)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-secondary",
                    a.primary ? "border-gold/40" : "border-border",
                  )}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-xl">
                    {a.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">{bot.name}</span>
                      {bot.auto_paused && (
                        <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">⏸ Paused</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {bot.symbol} · {bot.timeframe} · ${fmtUsd(Number(bot.amount))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", running ? "bg-success animate-pulse" : "bg-muted-foreground/50")} />
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {q ? `$${fmtPrice(q.price, bot.symbol)}` : "—"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <PriceDetailModal symbol={detailSymbol} quotes={quotes} history={history} onClose={() => setDetailSymbol(null)} />
      <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { /* realtime refreshes list */ }} />
    </div>
  );
}
