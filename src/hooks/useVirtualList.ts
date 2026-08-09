import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Fixed-height virtual list.
 *
 * Renders only the rows inside the scroll viewport (plus an overscan margin),
 * so a 40 000-channel playlist costs the same DOM as a 20-channel one.
 *
 * Usage:
 *   const v = useVirtualList(items.length, { rowHeight: 52 });
 *   <div ref={v.scrollRef} className="overflow-y-auto">
 *     <div style={v.spacerStyle}>
 *       <div style={v.offsetStyle}>{items.slice(v.start, v.end).map(...)}</div>
 *     </div>
 *   </div>
 */
export function useVirtualList(
  count: number,
  { rowHeight, overscan = 6, gap = 0 }: { rowHeight: number; overscan?: number; gap?: number },
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const stride = rowHeight + gap;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport(el.clientHeight);
    setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    let frame = 0;
    const onScroll = () => {
      // One state update per frame keeps fast flicks smooth on low-end phones.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);

  const visible = Math.max(1, Math.ceil((viewport || 600) / stride));
  const start = Math.max(0, Math.floor(scrollTop / stride) - overscan);
  const end = Math.min(count, start + visible + overscan * 2);

  return useMemo(
    () => ({
      scrollRef,
      start,
      end,
      spacerStyle: { height: Math.max(0, count * stride - gap), position: 'relative' as const },
      offsetStyle: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        transform: `translateY(${start * stride}px)`,
      },
      /** Jump back to the top (used when the filter/query changes). */
      scrollToTop: () => scrollRef.current?.scrollTo({ top: 0 }),
    }),
    [start, end, count, stride, gap],
  );
}

/**
 * Progressive reveal for grids whose cells have no fixed height (posters,
 * category sections). Renders `step` items and grows only when the sentinel
 * scrolls into view, so the first paint never builds thousands of nodes.
 */
export function useIncrementalList(count: number, step = 48, deps: unknown[] = []) {
  const [limit, setLimit] = useState(step);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Any change of the underlying query/filter restarts the window.
  useEffect(() => {
    setLimit(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ...deps]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || limit >= count) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((l) => Math.min(count, l + step));
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, count, step]);

  return { limit: Math.min(limit, count), sentinelRef, hasMore: limit < count };
}
