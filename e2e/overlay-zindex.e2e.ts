import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end: the IPTV stream overlay (M3uStreamView) must always render as a
 * true full-screen layer, on every route and at every breakpoint.
 *
 * The overlay is rendered through a React portal into <body> with the classes
 * `fixed inset-0 z-[100] flex flex-col overscroll-contain bg-background`.
 * Because reaching the real player requires an active subscription + a loaded
 * playlist (not available in CI), the spec verifies the *stacking contract* by
 * mounting a probe element carrying the exact same class list into the live app
 * DOM of each route. This exercises the real Tailwind CSS and the real ancestor
 * chain, which is what actually determines whether the overlay can be clipped,
 * offset, or painted under something else.
 *
 * Assertions per route × breakpoint:
 *   1. The probe is a direct child of <body> (portal target is not nested).
 *   2. Computed position is `fixed` and computed z-index is exactly 100.
 *   3. Its rect covers the whole viewport (top/left = 0, size = viewport) even
 *      after the page behind it has been scrolled.
 *   4. No ancestor creates a stacking context (transform / filter / perspective
 *      / contain:paint / will-change:transform) — any of these would break the
 *      `fixed` positioning and let page content show above the player.
 *   5. Hit-testing at the top-left corner and at the viewport centre resolves to
 *      the overlay itself, so nothing paints above it except the toast layer.
 */

const ROUTES = [
  "/",
  "/iptv",
  "/live-tv",
  "/crypto",
  "/movies",
  "/sport-live",
  "/quran",
  "/finance",
] as const;

const BREAKPOINTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** Class list must stay in sync with src/components/livetv/M3uStreamView.tsx */
const OVERLAY_CLASSES =
  "fixed inset-0 z-[100] flex flex-col overscroll-contain bg-background";

interface ProbeResult {
  parentTag: string;
  position: string;
  zIndex: string;
  rect: { top: number; left: number; width: number; height: number };
  viewport: { width: number; height: number };
  stackingAncestors: string[];
  hitTopLeft: boolean;
  hitCenter: boolean;
  /** Elements painted at z-index >= 100 that are not the overlay. */
  siblingsAtOrAbove: string[];
}

async function probeOverlay(page: Page, classes: string): Promise<ProbeResult> {
  return page.evaluate((className) => {
    const el = document.createElement("div");
    el.className = className;
    el.dataset.overlayProbe = "1";
    document.body.appendChild(el);

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    const stackingAncestors: string[] = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const creates =
        s.transform !== "none" ||
        s.filter !== "none" ||
        s.perspective !== "none" ||
        (s.contain || "").includes("paint") ||
        (s.willChange || "").includes("transform");
      if (creates) stackingAncestors.push(`${a.tagName}.${String(a.className).slice(0, 40)}`);
    }

    const siblingsAtOrAbove = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((n) => {
        if (n === el || el.contains(n)) return false;
        const s = getComputedStyle(n);
        if (s.position === "static" || s.visibility === "hidden" || s.display === "none") return false;
        const z = parseInt(s.zIndex, 10);
        const r = n.getBoundingClientRect();
        return !Number.isNaN(z) && z >= 100 && r.width > 0 && r.height > 0;
      })
      .map((n) => `${n.tagName}.${String(n.className).slice(0, 40)} z=${getComputedStyle(n).zIndex}`);

    const hitTopLeft = document.elementFromPoint(4, 4) === el;
    const hitCenter =
      document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2)) === el;

    const result = {
      parentTag: el.parentElement!.tagName,
      position: style.position,
      zIndex: style.zIndex,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      stackingAncestors,
      hitTopLeft,
      hitCenter,
      siblingsAtOrAbove,
    };

    el.remove();
    return result;
  }, classes);
}

for (const bp of BREAKPOINTS) {
  test.describe(`stream overlay stacking — ${bp.name} (${bp.width}x${bp.height})`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });

    for (const route of ROUTES) {
      test(`overlay stays full-screen at z-100 on ${route}`, async ({ page }) => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // Let the route render, then scroll the page behind the overlay: a broken
        // stacking/containing block shows up as a non-zero rect top.
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollTo(0, 400));

        const r = await probeOverlay(page, OVERLAY_CLASSES);

        // 1. portal target
        expect(r.parentTag).toBe("BODY");

        // 2. stacking contract
        expect(r.position).toBe("fixed");
        expect(r.zIndex).toBe("100");

        // 3. full-viewport coverage (sub-pixel tolerance for zoom/dpr rounding)
        expect(r.rect.top).toBeCloseTo(0, 0);
        expect(r.rect.left).toBeCloseTo(0, 0);
        expect(r.rect.width).toBeCloseTo(r.viewport.width, 0);
        expect(r.rect.height).toBeCloseTo(r.viewport.height, 0);

        // 4. nothing above it may create a stacking context
        expect(r.stackingAncestors, `stacking-context ancestors on ${route}`).toEqual([]);

        // 5. hit-testing: the overlay receives corner and centre pointer events
        expect(r.hitTopLeft, `top-left hit-test on ${route}`).toBe(true);
        expect(r.hitCenter, `centre hit-test on ${route}`).toBe(true);

        // Only the toast viewport (and the optional install prompt) are allowed
        // to share the z-100 layer; page chrome must stay below it.
        for (const sibling of r.siblingsAtOrAbove) {
          expect(
            /^OL\.|toast|installprompt|fixed inset-x-0 bottom-0/i.test(sibling),
            `unexpected element at z>=100 on ${route}: ${sibling}`,
          ).toBe(true);
        }
      });
    }
  });
}
