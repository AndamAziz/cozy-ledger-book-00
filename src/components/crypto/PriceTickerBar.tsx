import { useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMetalsData } from "@/hooks/useMetalsData";
import { useForexData } from "@/hooks/useForexData";
import { useCryptoLivePrices } from "@/hooks/useCryptoLivePrices";
import { getCoinMeta, getDisplaySymbol, getSymbolFromPair } from "@/lib/krakenApi";

/** Crypto pairs to show — same source/pairs as the Crypto page (Kraken). */
const CRYPTO_PAIRS = ["XBT/USD", "ETH/USD", "SOL/USD", "XRP/USD", "ADA/USD", "DOGE/USD"];
/** Commodity codes to show — same source as the Commodities page. */
const METAL_CODES = ["XAU", "XAG", "XPT", "USOIL"];
/** Major forex currencies to show — same source as the Forex page (USD base). */
const FX_CODES = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"];
const FX_FLAG: Record<string, string> = {
  EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺",
};

interface TickerItem {
  key: string;
  emoji: string;
  label: string;
  priceText: string;
  changePct: number | null;
}

function fmtFxRate(rate: number): string {
  if (rate >= 1000) return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (rate >= 1) return rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return rate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function fmtCrypto(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/**
 * Continuous, seamless horizontal auto-scrolling live price ticker.
 * Pulls from the EXACT same hooks/sources as each respective page so values match:
 *  - Commodities: useMetalsData (commodities-prices)
 *  - Forex: useForexData (forex-prices)
 *  - Crypto: Kraken REST + WebSocket (same as Crypto page)
 */
export function PriceTickerBar() {
  const { dir } = useLanguage();
  const { metals } = useMetalsData();
  const { currencies } = useForexData();
  const { quotes: crypto } = useCryptoLivePrices(CRYPTO_PAIRS);

  const items = useMemo<TickerItem[]>(() => {
    const out: TickerItem[] = [];

    // Commodities
    for (const code of METAL_CODES) {
      const m = metals.find((x) => x.code === code);
      if (!m || !(m.price > 0)) continue;
      out.push({
        key: `metal:${code}`,
        emoji: m.emoji,
        label: code === "USOIL" ? "OIL" : code,
        priceText: `$${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        changePct: m.change,
      });
    }

    // Forex (USD base, exactly as the Forex page displays)
    for (const code of FX_CODES) {
      const c = currencies.find((x) => x.code === code);
      if (!c || !(c.rate > 0)) continue;
      out.push({
        key: `fx:${code}`,
        emoji: FX_FLAG[code] ?? c.flag ?? "💱",
        label: `USD/${code}`,
        priceText: fmtFxRate(c.rate),
        changePct: c.change,
      });
    }

    // Crypto
    for (const pair of CRYPTO_PAIRS) {
      const q = crypto[pair];
      if (!q || !(q.price > 0)) continue;
      const sym = getDisplaySymbol(getSymbolFromPair(pair));
      out.push({
        key: `crypto:${pair}`,
        emoji: getCoinMeta(getSymbolFromPair(pair)).logo,
        label: sym,
        priceText: `$${fmtCrypto(q.price)}`,
        changePct: q.change24h,
      });
    }

    return out;
  }, [metals, currencies, crypto]);

  // Slow, readable speed: ~5s per item for the full (single) list.
  const durationSec = Math.max(50, items.length * 5);

  const renderRow = (ariaHidden: boolean) =>
    items.map((it) => {
      const up = (it.changePct ?? 0) >= 0;
      return (
        <div
          key={(ariaHidden ? "b:" : "a:") + it.key}
          className="flex items-center gap-2 px-5 whitespace-nowrap"
        >
          <span className="text-base leading-none">{it.emoji}</span>
          <span className="text-sm font-bold text-foreground">{it.label}</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{it.priceText}</span>
          {it.changePct !== null && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                up ? "text-success" : "text-destructive",
              )}
            >
              {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {up ? "+" : ""}
              {it.changePct.toFixed(2)}%
            </span>
          )}
          <span className="ms-3 h-4 w-px bg-border/70" aria-hidden />
        </div>
      );
    });

  if (items.length === 0) return null;

  return (
    <div className="ticker-mask relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl py-2.5 mb-3 sm:mb-5 no-print">
      <div
        className={cn("ticker-track", dir === "rtl" && "ticker-track-rtl")}
        dir="ltr"
        style={{ animationDuration: `${durationSec}s` }}
      >
        <div className="flex shrink-0">{renderRow(false)}</div>
        <div className="flex shrink-0" aria-hidden>
          {renderRow(true)}
        </div>
      </div>
    </div>
  );
}
