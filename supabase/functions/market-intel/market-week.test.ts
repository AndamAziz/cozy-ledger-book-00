import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fxWhen,
  isForexMarketClosed,
  isForexMarketOpen,
  nextForexClose,
  nextForexOpen,
} from "./market-week.ts";

// All dates are UTC. Day-of-week: 0=Sun, 1=Mon … 5=Fri, 6=Sat.

Deno.test("Saturday is ALWAYS closed (the reported bug: Asia 'open' fired on Sat)", () => {
  // Saturday 2026-06-20 at 00:00 UTC — the exact hour the Asia session used to
  // (wrongly) trigger. It MUST now be closed.
  assert(isForexMarketClosed(new Date("2026-06-20T00:00:00Z")));
  assert(isForexMarketClosed(new Date("2026-06-20T07:00:00Z"))); // London hour
  assert(isForexMarketClosed(new Date("2026-06-20T13:00:00Z"))); // NY hour
  assert(isForexMarketClosed(new Date("2026-06-20T23:59:00Z")));
  assertFalse(isForexMarketOpen(new Date("2026-06-20T00:00:00Z")));
});

Deno.test("Sunday is closed until 22:00 UTC, then opens", () => {
  assert(isForexMarketClosed(new Date("2026-06-21T00:00:00Z"))); // Sun 00:00 closed
  assert(isForexMarketClosed(new Date("2026-06-21T21:59:00Z"))); // Sun 21:59 closed
  assert(isForexMarketOpen(new Date("2026-06-21T22:00:00Z"))); // Sun 22:00 OPEN
  assert(isForexMarketOpen(new Date("2026-06-21T23:00:00Z")));
});

Deno.test("Friday is open until 22:00 UTC, then closes for the weekend", () => {
  assert(isForexMarketOpen(new Date("2026-06-19T21:59:00Z"))); // Fri 21:59 open
  assert(isForexMarketClosed(new Date("2026-06-19T22:00:00Z"))); // Fri 22:00 CLOSED
  assert(isForexMarketClosed(new Date("2026-06-19T23:30:00Z")));
});

Deno.test("Mon–Thu are fully open at every hour", () => {
  for (const day of ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"]) {
    for (const h of [0, 6, 11, 16, 21, 23]) {
      const d = new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`);
      assert(isForexMarketOpen(d), `${d.toUTCString()} should be open`);
    }
  }
});

Deno.test("nextForexOpen from Saturday points to the upcoming Sunday 22:00 UTC", () => {
  const open = nextForexOpen(new Date("2026-06-20T10:00:00Z")); // from Saturday
  assertEquals(open.toISOString(), "2026-06-21T22:00:00.000Z");
});

Deno.test("nextForexClose from mid-week points to that Friday 22:00 UTC", () => {
  const close = nextForexClose(new Date("2026-06-17T10:00:00Z")); // Wednesday
  assertEquals(close.toISOString(), "2026-06-19T22:00:00.000Z");
});

Deno.test("fxWhen renders a readable UTC label", () => {
  assertEquals(fxWhen(new Date("2026-06-21T22:00:00Z")), "Sun 22:00 UTC");
});
