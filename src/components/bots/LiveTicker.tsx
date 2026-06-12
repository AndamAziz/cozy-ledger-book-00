import { ASSETS, fmtPrice } from "@/lib/botAssets";
import type { Quote } from "@/hooks/useBotPrices";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveTickerProps {
  quotes: Record<string, Quote>;
  onSelect: (symbol: string) => void;
}

/** Horizontal scrollable live price ticker (Gold first). */
export function LiveTicker({ quotes, onSelect }: LiveTickerProps) {
  return (
    <div className="-mx-1 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 px-1 pb-1">
        {ASSETS.map((a) => {
          const q = quotes[a.symbol];
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <button
              key={a.symbol}
              onClick={() => onSelect(a.symbol)}
              className={cn(
                "shrink-0 min-w-[8.5rem] rounded-xl border p-2.5 text-left transition-colors",
                a.primary
                  ? "border-gold/50 bg-gold/5 hover:bg-gold/10"
                  : "border-border bg-card hover:bg-secondary",
              )}
            >
              <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <span>{a.emoji}</span>
                <span>{a.symbol}</span>
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                {q ? `$${fmtPrice(q.price, a.symbol)}` : "—"}
              </div>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-0.5 text-xs font-medium tabular-nums",
                  up ? "text-success" : "text-destructive",
                )}
              >
                {q ? (
                  <>
                    {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {up ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </>
                ) : (
                  "…"
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
