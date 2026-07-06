// Auto chart layout presets.
// Picks the best candle spacing + price-scale margins based on the
// available chart width, the number of candles, and the timeframe so
// candles never crowd or overlap the price labels.

export interface ChartPreset {
  rightOffset: number;
  barSpacing: number;
  minBarSpacing: number;
  scaleMarginTop: number;
  scaleMarginBottom: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Compute an optimal chart layout preset.
 * @param width      Chart container width in px.
 * @param candleCount Number of candles to display.
 * @param intraday   Whether the timeframe is intraday (minutes/hours).
 */
export function computeChartPreset(
  width: number,
  candleCount: number,
  intraday = false,
  targetVisibleBars?: number
): ChartPreset {
  const w = width > 0 ? width : 600;
  const count = Math.max(candleCount, 1);
  const isMobile = w < 500;

  // Reserve space for the price axis on the right (~56px) before sizing bars.
  const usable = Math.max(w - 56, 120);

  // Right offset gives breathing room between the latest candle and price labels.
  const rightOffset = isMobile ? 8 : 12;

  // Size bars for the number of candles we actually intend to SHOW. When a
  // target window is given (e.g. the last 90 bars), spacing is based on that
  // slice so bars stay readable instead of collapsing to 1px when the series is
  // deliberately over-fetched for indicator math.
  const shown = targetVisibleBars && targetVisibleBars > 0
    ? Math.min(count, targetVisibleBars)
    : count;
  const ideal = usable / (shown + rightOffset);

  // Intraday charts have more candles -> allow tighter bars; longer ranges -> wider.
  const maxBar = intraday ? (isMobile ? 9 : 12) : (isMobile ? 12 : 16);
  const minBar = isMobile ? 4 : 5;
  const barSpacing = +clamp(ideal, minBar, maxBar).toFixed(1);

  // Floor the min spacing at 3px so a fully zoomed-out view still shows candle
  // bodies (not just wick lines) even with a large over-fetched dataset.
  const minBarSpacing = +clamp(barSpacing * 0.5, 3, 6).toFixed(1);

  // Vertical breathing room so wicks never touch the top/bottom edges.
  const scaleMarginTop = isMobile ? 0.14 : 0.1;
  const scaleMarginBottom = isMobile ? 0.14 : 0.1;

  return { rightOffset, barSpacing, minBarSpacing, scaleMarginTop, scaleMarginBottom };
}
