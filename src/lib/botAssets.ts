/** Supported trading assets, in display order (Gold first). */
export type AssetClass = "metal" | "crypto" | "forex";

export interface AssetMeta {
  symbol: string; // canonical pair, e.g. "XAU/USD"
  name: string;
  emoji: string;
  assetClass: AssetClass;
  decimals: number;
  primary?: boolean;
}

export const ASSETS: AssetMeta[] = [
  { symbol: "XAU/USD", name: "Gold", emoji: "⭐", assetClass: "metal", decimals: 2, primary: true },
  { symbol: "XAG/USD", name: "Silver", emoji: "🥈", assetClass: "metal", decimals: 3 },
  { symbol: "BTC/USD", name: "Bitcoin", emoji: "₿", assetClass: "crypto", decimals: 2 },
  { symbol: "ETH/USD", name: "Ethereum", emoji: "Ξ", assetClass: "crypto", decimals: 2 },
  { symbol: "BNB/USD", name: "BNB", emoji: "🟡", assetClass: "crypto", decimals: 2 },
  { symbol: "SOL/USD", name: "Solana", emoji: "◎", assetClass: "crypto", decimals: 2 },
  { symbol: "XRP/USD", name: "XRP", emoji: "✕", assetClass: "crypto", decimals: 4 },
  { symbol: "EUR/USD", name: "Euro / USD", emoji: "💶", assetClass: "forex", decimals: 5 },
  { symbol: "GBP/USD", name: "GBP / USD", emoji: "💷", assetClass: "forex", decimals: 5 },
  { symbol: "USD/JPY", name: "USD / JPY", emoji: "💴", assetClass: "forex", decimals: 3 },
];

export const ASSET_GROUPS: { label: string; assets: AssetMeta[] }[] = [
  { label: "Metals", assets: ASSETS.filter((a) => a.assetClass === "metal") },
  { label: "Crypto", assets: ASSETS.filter((a) => a.assetClass === "crypto") },
  { label: "Forex", assets: ASSETS.filter((a) => a.assetClass === "forex") },
];

export function getAsset(symbol: string): AssetMeta {
  return ASSETS.find((a) => a.symbol === symbol) ?? ASSETS[0];
}

export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const STRATEGIES = [
  { value: "conservative", label: "Conservative", hint: "Score ≥ 3 to trade (safer)" },
  { value: "balanced", label: "Balanced", hint: "Score ≥ 2 to trade (default)" },
  { value: "aggressive", label: "Aggressive", hint: "Score ≥ 1 to trade (more trades)" },
] as const;

/** Format a price using the asset's preferred decimals. */
export function fmtPrice(value: number, symbol: string): string {
  const a = getAsset(symbol);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: a.decimals,
    maximumFractionDigits: a.decimals,
  });
}

/** Format a USD money amount (2 decimals). */
export function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
