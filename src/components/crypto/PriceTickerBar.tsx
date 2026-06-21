import { useBotPrices } from "@/hooks/useBotPrices";
import { ASSETS, fmtPrice } from "@/lib/botAssets";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Continuous, seamless horizontal auto-scrolling live price ticker.
 * - Reads from the same live source as the rest of the app (bots-prices, 2s cadence).
 * - Duplicates the item list so the marquee loops with no visible jump.
 * - Pauses on hover/touch; resumes on release.
 * - Edge fade masks on both sides; direction flips for RTL.
 */
export function PriceTickerBar() {
  const { quotes } = useBotPrices();
  const { dir } = useLanguage();

  const row = ASSETS.map((a) => {
    const q = quotes[a.symbol];
    const up = (q?.changePct ?? 0) >= 0;
    const base = a.symbol.split("/")[0];
    return (
      <div key={a.symbol} className="flex items-center gap-1.5 px-3 whitespace-nowrap">
        <span className="text-sm leading-none">{a.emoji}</span>
        <span className="text-xs font-semibold text-foreground">{base}</span>
        <span className="text-xs font-bold tabular-nums text-foreground">
          {q ? `$${fmtPrice(q.price, a.symbol)}` : "—"}
        </span>
        {q && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
              up ? "text-success" : "text-destructive",
            )}
          >
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {q.changePct.toFixed(2)}%
          </span>
        )}
        <span className="ms-2 h-3 w-px bg-border/70" aria-hidden />
      </div>
    );
  });

  return (
    <div className="ticker-mask relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl py-2 mb-3 sm:mb-5 no-print">
      <div className={cn("ticker-track", dir === "rtl" && "ticker-track-rtl")} dir="ltr">
        <div className="flex shrink-0">{row}</div>
        <div className="flex shrink-0" aria-hidden>
          {row}
        </div>
      </div>
    </div>
  );
}
