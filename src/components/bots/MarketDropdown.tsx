import { useEffect, useRef, useState } from "react";
import { ASSET_GROUPS, fmtPrice } from "@/lib/botAssets";
import { getMarketStatus, timeUntil, type MarketStatus } from "@/lib/marketHours";
import type { Quote } from "@/hooks/useBotPrices";
import type { AssetClass } from "@/lib/botAssets";
import { ChevronDown, ArrowUp, ArrowDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketDropdownProps {
  quotes: Record<string, Quote>;
  updatedLabel: string;
  onSelect: (symbol: string) => void;
}

const CLASS_OF_GROUP: Record<string, AssetClass> = {
  Metals: "metal",
  Crypto: "crypto",
  Forex: "forex",
};

function StatusBadge({ status }: { status: MarketStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        status.open
          ? "bg-success/15 text-success"
          : "bg-destructive/15 text-destructive",
      )}
    >
      <Circle className={cn("h-2 w-2 fill-current", status.open && "animate-pulse")} />
      {status.open ? "Open" : "Closed"}
      {!status.open && status.nextChange && (
        <span className="font-normal opacity-80">· {timeUntil(status.nextChange)}</span>
      )}
    </span>
  );
}

/** Professional dropdown menu for the Live Markets section. */
export function MarketDropdown({ quotes, updatedLabel, onSelect }: MarketDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const gold = quotes["XAU/USD"];
  const goldUp = (gold?.changePct ?? 0) >= 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary",
          open ? "border-gold/50" : "border-border",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-lg">⭐</span>
          <div>
            <div className="text-sm font-bold text-foreground">Live Markets</div>
            <div className="text-[11px] text-muted-foreground">{updatedLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums text-foreground">
              {gold ? `$${fmtPrice(gold.price, "XAU/USD")}` : "—"}
            </div>
            <div
              className={cn(
                "flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums",
                goldUp ? "text-success" : "text-destructive",
              )}
            >
              {gold ? (
                <>
                  {goldUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {goldUp ? "+" : ""}
                  {gold.changePct.toFixed(2)}%
                </>
              ) : (
                "…"
              )}
            </div>
          </div>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-xl">
          {ASSET_GROUPS.map((group) => {
            const status = getMarketStatus(CLASS_OF_GROUP[group.label]);
            return (
              <div key={group.label} className="mb-1 last:mb-0">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </span>
                  <StatusBadge status={status} />
                </div>
                {group.assets.map((a) => {
                  const q = quotes[a.symbol];
                  const up = (q?.changePct ?? 0) >= 0;
                  return (
                    <button
                      key={a.symbol}
                      onClick={() => {
                        onSelect(a.symbol);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary",
                        a.primary && "bg-gold/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{a.emoji}</span>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{a.symbol}</div>
                          <div className="text-[11px] text-muted-foreground">{a.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold tabular-nums text-foreground">
                          {q ? `$${fmtPrice(q.price, a.symbol)}` : "—"}
                        </div>
                        <div
                          className={cn(
                            "flex items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums",
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
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
