import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { outcomePips, resolveOutcome } from "./outcome-resolver.ts";

const t0 = Date.UTC(2026, 0, 1, 0, 0, 0); // ms
// Build candles starting at t0, one per minute, from [o,h,l,c] tuples.
const mk = (rows: [number, number, number, number][]) =>
  rows.map((r, i) => ({
    time: Math.floor(t0 / 1000) + i * 60,
    open: r[0], high: r[1], low: r[2], close: r[3],
  }));

Deno.test("BUY hits TP1 first", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 101, 99.5, 100.5], [100.5, 103.2, 100, 103]]),
  });
  assertEquals(r.outcome, "tp1");
  assertEquals(r.stage, 1);
});

Deno.test("BUY runs to TP2", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 103.5, 99.5, 103], [103, 106.5, 102, 106]]),
  });
  assertEquals(r.outcome, "tp2");
  assertEquals(r.stage, 2);
  assertEquals(outcomePips(r, "BUY", 100, 1), 6);
});

Deno.test("BUY stops out before any TP", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 101, 97.5, 98]]),
  });
  assertEquals(r.outcome, "sl");
  assertEquals(outcomePips(r, "BUY", 100, 1), -2);
});

Deno.test("conservative: same candle spans SL and TP1 -> SL wins", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 103.5, 97.5, 99]]),
  });
  assertEquals(r.outcome, "sl");
});

Deno.test("TP1 locked then stop -> still a TP1 win", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 103.2, 100, 103], [103, 103.5, 97.5, 98]]),
  });
  assertEquals(r.outcome, "tp1");
});

Deno.test("SELL hits TP1 first", () => {
  const r = resolveOutcome({
    side: "SELL", entry: 100, sl: 102, tp1: 97, tp2: 94,
    openedAtMs: t0,
    candles: mk([[100, 100.5, 96.5, 97]]),
  });
  assertEquals(r.outcome, "tp1");
});

Deno.test("SELL stops out", () => {
  const r = resolveOutcome({
    side: "SELL", entry: 100, sl: 102, tp1: 97, tp2: 94,
    openedAtMs: t0,
    candles: mk([[100, 102.5, 99, 102]]),
  });
  assertEquals(r.outcome, "sl");
  assertEquals(outcomePips(r, "SELL", 100, 1), -2);
});

Deno.test("expired when no level touched", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: mk([[100, 101, 99, 100.4], [100.4, 101.2, 99.2, 100.8]]),
  });
  assertEquals(r.outcome, "expired");
  assertEquals(outcomePips(r, "BUY", 100, 1), 1);
});

Deno.test("open when no candles after signal", () => {
  const r = resolveOutcome({
    side: "BUY", entry: 100, sl: 98, tp1: 103, tp2: 106,
    openedAtMs: t0,
    candles: [],
  });
  assertEquals(r.outcome, "open");
});
