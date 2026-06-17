import { useCallback, useEffect, useState } from "react";
import { callEngine } from "@/hooks/useBotPrices";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

interface VolReport {
  level: "LOW" | "MEDIUM" | "HIGH";
  spread: number;
  avgMove: number;
  percent: number;
}

const SEGMENTS = 10;

/** Format a points value: 2 decimals for big instruments, 4 for forex. */
function pts(n: number): string {
  return Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4);
}

const META: Record<VolReport["level"], { dot: string; short: string; color: string; bar: string }> = {
  LOW: { dot: "🔴", short: "LOW", color: "text-destructive", bar: "bg-destructive" },
  MEDIUM: { dot: "🟡", short: "MED", color: "text-gold", bar: "bg-gold" },
  HIGH: { dot: "🟢", short: "HIGH", color: "text-success", bar: "bg-success" },
};

/**
 * Live volatility gauge for a bot symbol. Polls the engine's `volatility`
 * action every 30 seconds and renders a 10-segment meter plus the current
 * spread and average candle size — the same signals the bot trades on.
 */
export function VolatilityMeter({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const [vol, setVol] = useState<VolReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await callEngine({ action: "volatility", symbol, timeframe });
      if (r && typeof r.percent === "number") {
        setVol({ level: r.level, spread: r.spread, avgMove: r.avgMove, percent: r.percent });
      }
    } catch {
      /* keep last reading */
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Update every 30 seconds.
  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const meta = vol ? META[vol.level] : META.LOW;
  const percent = vol?.percent ?? 0;
  const filled = Math.round((percent / 100) * SEGMENTS);

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-gold" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Volatility Meter
          </span>
        </div>
        <span className={cn("text-xs font-bold", meta.color)}>
          {meta.dot} {meta.short}
        </span>
      </div>

      {/* Segmented gauge */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3 flex-1 rounded-sm transition-colors duration-500",
                i < filled ? meta.bar : "bg-secondary",
              )}
            />
          ))}
        </div>
        <span className={cn("w-10 text-right text-sm font-bold tabular-nums", meta.color)}>
          {loading && !vol ? "—" : `${percent}%`}
        </span>
      </div>

      {/* Spread + average candle size */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Spread</div>
          <div className="font-bold tabular-nums text-foreground">
            {vol ? pts(vol.spread) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Avg Candle</div>
          <div className="font-bold tabular-nums text-foreground">
            {vol ? `${pts(vol.avgMove)} pts` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
