import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkline } from "@/components/crypto/Sparkline";
import { getAsset, fmtPrice } from "@/lib/botAssets";
import type { Quote } from "@/hooks/useBotPrices";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriceDetailModalProps {
  symbol: string | null;
  quotes: Record<string, Quote>;
  history: Record<string, number[]>;
  onClose: () => void;
}

export function PriceDetailModal({ symbol, quotes, history, onClose }: PriceDetailModalProps) {
  if (!symbol) return null;
  const a = getAsset(symbol);
  const q = quotes[symbol];
  const up = (q?.changePct ?? 0) >= 0;
  const series = history[symbol] ?? [];

  return (
    <Dialog open={!!symbol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{a.emoji}</span>
            <span>{a.symbol}</span>
            <span className="text-sm font-normal text-muted-foreground">{a.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold tabular-nums text-foreground">
              {q ? `$${fmtPrice(q.price, symbol)}` : "—"}
            </div>
            <div
              className={cn(
                "mt-1 flex items-center gap-1 text-sm font-medium tabular-nums",
                up ? "text-success" : "text-destructive",
              )}
            >
              {up ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              {q ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "…"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-2">
            <Sparkline data={series} color={up ? "#22c55e" : "#ef4444"} height={64} />
            <div className="mt-1 text-center text-[11px] text-muted-foreground">
              Last {series.length} live prices
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">24h High</div>
              <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                {q ? `$${fmtPrice(q.high24h, symbol)}` : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">24h Low</div>
              <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                {q ? `$${fmtPrice(q.low24h, symbol)}` : "—"}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
