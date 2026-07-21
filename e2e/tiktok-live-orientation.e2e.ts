import { test, expect, type Page } from "@playwright/test";
import { toSocialEmbed } from "../src/lib/socialEmbed";

/**
 * End-to-end: rotating the device between portrait and landscape must keep the
 * TikTok LIVE embed perfectly fitted with SportLivePlayer's auto-fit rules —
 * no letterboxing, no overflow, and the iframe must remount on the flip so
 * TikTok re-lays out to the new size.
 *
 * The test mounts a page that mirrors the component's layout contract:
 *   - `aspect-[9/16]` container + `max-w-[min(100%,calc((100vh-8rem)*9/16))]`
 *     wrapper (portrait source, matches SportLivePlayer's auto-fit branch).
 *   - A ResizeObserver bumps the iframe's `data-layout-nonce` and `key` when
 *     the container's orientation flips, matching the component's behaviour.
 *
 * Across a matrix of real device sizes (small phone → tablet → desktop) we:
 *   1. Load portrait viewport, assert container aspect ≈ 9/16 and fits the
 *      viewport with no overflow.
 *   2. Rotate to landscape via `page.setViewportSize`, assert the container
 *      still holds 9/16, fits in the new box, and the iframe remounted.
 *   3. Rotate back to portrait, same assertions, and confirm remount ran again.
 *   4. Assert the TikTok embed document itself returned an OK HTTP status and
 *      no "Video unavailable" hard-error text after each rotation.
 */

const LIVE_URL = "https://www.tiktok.com/@aminheyasi/live";
const EMBED_URL = toSocialEmbed(LIVE_URL)!.embedUrl;

/** Devices covering the realistic breakpoints users open the app on. */
const DEVICES: Array<{
  name: string;
  portrait: { width: number; height: number };
  landscape: { width: number; height: number };
}> = [
  { name: "iPhone SE",   portrait: { width: 375, height: 667 },  landscape: { width: 667, height: 375 } },
  { name: "iPhone 13",   portrait: { width: 390, height: 844 },  landscape: { width: 844, height: 390 } },
  { name: "Pixel 5",     portrait: { width: 393, height: 851 },  landscape: { width: 851, height: 393 } },
  { name: "iPad Mini",   portrait: { width: 768, height: 1024 }, landscape: { width: 1024, height: 768 } },
  { name: "Desktop",     portrait: { width: 900, height: 1200 }, landscape: { width: 1440, height: 900 } },
];

const HARD_ERROR_TEXT = /Video unavailable|Couldn['’]t find this account|Page not found/i;

/**
 * Harness page: mirrors the auto-fit rules from SportLivePlayer for a portrait
 * source. Exposes `window.__nonce` (incremented on orientation flip) so the
 * test can prove the iframe was remounted after each rotation.
 */
function harnessHtml(embedUrl: string): string {
  return `<!doctype html><html><head><style>
    html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui}
    #area{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box}
    /* Matches SportLivePlayer: aspect-[9/16] wrapper capped so it fits height. */
    #box{position:relative;width:100%;max-width:min(100%, calc((100vh - 8rem) * 9 / 16));aspect-ratio:9/16;overflow:hidden;border-radius:12px;background:#111}
    #box iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  </style></head><body>
    <div id="area"><div id="box"><iframe id="live" data-nonce="0" src="${embedUrl}"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe></div></div>
    <script>
      window.__nonce = 0;
      window.__lastOrientation = null;
      const box = document.getElementById('box');
      const iframe = document.getElementById('live');
      const ro = new ResizeObserver(() => {
        const r = box.getBoundingClientRect();
        const orientation = r.height >= r.width ? 'portrait' : 'landscape';
        if (window.__lastOrientation !== null && window.__lastOrientation !== orientation) {
          window.__nonce += 1;
          iframe.setAttribute('data-nonce', String(window.__nonce));
          // Remount by resetting src — mirrors React key change.
          const src = iframe.src; iframe.src = 'about:blank'; iframe.src = src;
        }
        window.__lastOrientation = orientation;
      });
      ro.observe(box);
    </script>
  </body></html>`;
}

async function readLayout(page: Page) {
  return page.evaluate(() => {
    const box = document.getElementById("box")!;
    const iframe = document.getElementById("live") as HTMLIFrameElement;
    const r = box.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      ratio: r.width === 0 ? 0 : r.height / r.width,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      nonce: Number(iframe.getAttribute("data-nonce") || "0"),
      windowNonce: (window as unknown as { __nonce: number }).__nonce,
    };
  });
}

function assertFitsViewport(
  layout: { width: number; height: number; viewport: { w: number; h: number } },
  device: string,
  phase: string,
) {
  // Container must never overflow the viewport (allow 1px sub-pixel rounding).
  expect(
    layout.width,
    `${device} ${phase}: container width ${layout.width} exceeds viewport ${layout.viewport.w}`,
  ).toBeLessThanOrEqual(layout.viewport.w + 1);
  expect(
    layout.height,
    `${device} ${phase}: container height ${layout.height} exceeds viewport ${layout.viewport.h}`,
  ).toBeLessThanOrEqual(layout.viewport.h + 1);
  // And it must be visible — not collapsed to zero.
  expect(layout.width, `${device} ${phase}: container collapsed`).toBeGreaterThan(40);
  expect(layout.height, `${device} ${phase}: container collapsed`).toBeGreaterThan(40);
}

function assertPortraitAspect(
  layout: { ratio: number },
  device: string,
  phase: string,
) {
  // 9:16 → height/width = 16/9 ≈ 1.777. Allow ±5% for sub-pixel rounding.
  expect(
    layout.ratio,
    `${device} ${phase}: expected 9:16 aspect, got h/w=${layout.ratio.toFixed(3)}`,
  ).toBeGreaterThan(16 / 9 - 0.09);
  expect(layout.ratio).toBeLessThan(16 / 9 + 0.09);
}

async function assertEmbedOk(page: Page, device: string, phase: string) {
  const frame = page.frameLocator("#live");
  // TikTok's SPA needs a beat to boot.
  await page.waitForTimeout(2500);
  const bodyText = (await frame.locator("body").innerText().catch(() => "")) || "";
  expect(
    bodyText,
    `${device} ${phase}: TikTok live embed rendered a hard-error page: "${bodyText.slice(0, 160)}"`,
  ).not.toMatch(HARD_ERROR_TEXT);
}

test.describe("TikTok LIVE auto-fit across orientation changes", () => {
  test.setTimeout(90_000);

  for (const dev of DEVICES) {
    test(`${dev.name}: rotate portrait ↔ landscape keeps 9:16 fit & remounts iframe`, async ({
      page,
      browserName,
    }) => {
      // 1. Portrait first — capture the initial embed response HTTP status.
      await page.setViewportSize(dev.portrait);
      const embedResponsePromise = page.waitForResponse(
        (res) =>
          res.url().startsWith(EMBED_URL) &&
          res.request().resourceType() === "document",
        { timeout: 25_000 },
      );
      await page.setContent(harnessHtml(EMBED_URL), { waitUntil: "domcontentloaded" });
      const response = await embedResponsePromise;
      expect(
        response.status(),
        `${dev.name} on ${browserName}: TikTok returned ${response.status()}`,
      ).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(400);

      // Give ResizeObserver a frame to record the initial orientation without bumping.
      await page.waitForTimeout(150);
      const portrait1 = await readLayout(page);
      expect(portrait1.windowNonce, `${dev.name}: initial mount must not bump nonce`).toBe(0);
      assertPortraitAspect(portrait1, dev.name, "portrait #1");
      assertFitsViewport(portrait1, dev.name, "portrait #1");
      await assertEmbedOk(page, dev.name, "portrait #1");

      // 2. Rotate to landscape.
      await page.setViewportSize(dev.landscape);
      await page.waitForTimeout(400); // let ResizeObserver + iframe reload settle
      const landscape = await readLayout(page);
      assertPortraitAspect(landscape, dev.name, "landscape");
      assertFitsViewport(landscape, dev.name, "landscape");
      expect(
        landscape.windowNonce,
        `${dev.name}: orientation flip to landscape must remount iframe`,
      ).toBeGreaterThanOrEqual(1);
      expect(landscape.nonce).toBe(landscape.windowNonce);
      await assertEmbedOk(page, dev.name, "landscape");

      // 3. Rotate back to portrait — another remount, still fitted.
      await page.setViewportSize(dev.portrait);
      await page.waitForTimeout(400);
      const portrait2 = await readLayout(page);
      assertPortraitAspect(portrait2, dev.name, "portrait #2");
      assertFitsViewport(portrait2, dev.name, "portrait #2");
      expect(
        portrait2.windowNonce,
        `${dev.name}: rotating back to portrait must remount iframe again`,
      ).toBeGreaterThanOrEqual(2);
      await assertEmbedOk(page, dev.name, "portrait #2");
    });
  }
});
