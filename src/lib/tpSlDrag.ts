import type { IChartApi } from 'lightweight-charts';

/** Minimal shape of a position leg the drag helper needs. */
export interface DragLegLike {
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

export type DragSide = 'buy' | 'sell';
export type DragKind = 'tp' | 'sl';

export interface DragState {
  side: DragSide;
  kind: DragKind;
  price: number;
}

export interface TpSlDragOptions {
  /** The chart container element (receives the pointer events). */
  container: HTMLElement;
  /** The chart instance (scroll/scale is toggled while dragging). */
  chart: IChartApi;
  /** Returns the price series used for price <-> y conversions. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSeries: () => any;
  /** Returns the current open legs (buy / sell), or null. */
  getLegs: () => { buy: DragLegLike | null; sell: DragLegLike | null };
  /** Live price-line objects per side so the line tracks the finger instantly. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineRefs: { tp: Record<DragSide, any>; sl: Record<DragSide, any> };
  /** Shared override read by the draw effect so recreation keeps the dragged price. */
  dragRef: { current: DragState | null };
  /** Persist the final TP/SL values for a side. */
  onCommit: (side: DragSide, takeProfit: number | null, stopLoss: number | null) => void;
  /** Optional callback fired when a drag starts / ends (e.g. to re-render). */
  onChange?: () => void;
}

/** Pixel distance within which a press grabs a TP/SL line (touch-friendly). */
const GRAB_PX = 16;

/**
 * Makes the TP and SL price lines draggable on a lightweight-charts chart.
 * The user can drag a line to a new level; on release the value is committed
 * automatically (no extra data entry). Returns a cleanup function.
 */
export function attachTpSlDrag(opts: TpSlDragOptions): () => void {
  const { container, chart, getSeries, getLegs, lineRefs, dragRef, onCommit, onChange } = opts;

  let activePointer: number | null = null;

  const yToPrice = (clientY: number): number | null => {
    const series = getSeries();
    if (!series) return null;
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top;
    const p = series.coordinateToPrice(y);
    return typeof p === 'number' && isFinite(p) && p > 0 ? p : null;
  };

  // Find the nearest grabbable TP/SL line to a Y position (within GRAB_PX).
  const hitTest = (clientY: number): DragState | null => {
    const series = getSeries();
    if (!series) return null;
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top;
    const legs = getLegs();
    let best: DragState | null = null;
    let bestDist = GRAB_PX;
    (['buy', 'sell'] as DragSide[]).forEach((side) => {
      const leg = legs[side];
      if (!leg || leg.qty <= 0) return;
      const candidates: { kind: DragKind; price: number | null }[] = [
        { kind: 'tp', price: leg.takeProfit },
        { kind: 'sl', price: leg.stopLoss },
      ];
      candidates.forEach(({ kind, price }) => {
        if (price == null || price <= 0) return;
        const coord = series.priceToCoordinate(price);
        if (coord == null) return;
        const dist = Math.abs(coord - y);
        if (dist <= bestDist) {
          bestDist = dist;
          best = { side, kind, price };
        }
      });
    });
    return best;
  };

  const setLinePrice = (state: DragState) => {
    const line = lineRefs[state.kind][state.side];
    if (line) {
      try { line.applyOptions({ price: state.price }); } catch { /* ignore */ }
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (dragRef.current) return;
    const hit = hitTest(e.clientY);
    if (!hit) return;
    dragRef.current = hit;
    activePointer = e.pointerId;
    // Stop the chart from panning / zooming during the drag.
    chart.applyOptions({ handleScroll: false, handleScale: false });
    container.style.cursor = 'ns-resize';
    try { container.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
    e.stopPropagation();
    onChange?.();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const price = yToPrice(e.clientY);
    if (price == null) return;
    dragRef.current = { ...dragRef.current, price };
    setLinePrice(dragRef.current);
    e.preventDefault();
    e.stopPropagation();
  };

  const finish = (e: PointerEvent) => {
    const state = dragRef.current;
    if (!state) return;
    const legs = getLegs();
    const leg = legs[state.side];
    const tp = state.kind === 'tp' ? state.price : leg?.takeProfit ?? null;
    const sl = state.kind === 'sl' ? state.price : leg?.stopLoss ?? null;
    dragRef.current = null;
    activePointer = null;
    chart.applyOptions({ handleScroll: true, handleScale: true });
    container.style.cursor = '';
    try { container.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    onCommit(state.side, tp ? +tp.toFixed(6) : null, sl ? +sl.toFixed(6) : null);
    onChange?.();
  };

  // Hover cursor feedback when not dragging.
  const onHover = (e: PointerEvent) => {
    if (dragRef.current) return;
    container.style.cursor = hitTest(e.clientY) ? 'ns-resize' : '';
  };

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointermove', onPointerMove, true);
  container.addEventListener('pointermove', onHover, false);
  container.addEventListener('pointerup', finish, true);
  container.addEventListener('pointercancel', finish, true);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown, true);
    container.removeEventListener('pointermove', onPointerMove, true);
    container.removeEventListener('pointermove', onHover, false);
    container.removeEventListener('pointerup', finish, true);
    container.removeEventListener('pointercancel', finish, true);
    if (activePointer != null) {
      try { chart.applyOptions({ handleScroll: true, handleScale: true }); } catch { /* ignore */ }
    }
  };
}
