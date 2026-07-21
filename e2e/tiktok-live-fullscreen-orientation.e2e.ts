import { test, expect, type Page } from "@playwright/test";
import { toSocialEmbed } from "../src/lib/socialEmbed";

/**
 * End-to-end: when the SportLive player is already in fullscreen and the user
 * rotates the device (portrait ↔ landscape), the TikTok LIVE embed must:
 *   - keep its 9:16 auto-fit aspect,
 *   - never overflow the fullscreen box,
 *   - remount the iframe on every orientation flip (so TikTok re-lays out),
 *   - and the embed document must keep responding with a healthy status and no
 *     "Video unavailable" hard-error page.
 *
 * The harness mirrors SportLivePlayer's fullscreen contract: the `#box` element
 * itself is what gets `requestFullscreen()` (not `document.documentElement`),
 * and a ResizeObserver on `#box` bumps `data-nonce` + resets the iframe `src`
 * whenever the observed orientation of the fullscreen surface flips.
 *
 * We do NOT rely on the browser actually painting an OS-level fullscreen (Xvfb
 * headless can't). We rely on `element.requestFullscreen()` triggering the
 * fullscreenchange event + expanding the element to the viewport, which is
 * enough to reproduce the layout the user sees on a real device.
 */

const LIVE_URL = "https://www.tiktok.com/@aminheyasi/live";
const EMBED_URL = toSocialEmbed(LIVE_URL)!.embedUrl;

const DEVICES: Array<{
  name: string;
  portrait: { width: number; height: number };
  landscape: { width: number; height: number };
}> = [
  { name: "iPhone SE", portrait: { width: 375, height: 667 }, landscape: { width: 667, height: 375 } },
  { name: "iPhone 13", portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } },
  { name: "Pixel 5",   portrait: { width: 393, height: 851 }, landscape: { width: 851, height: 393 } },
  { name: "iPad Mini", portrait: { width: 768, height: 1024 }, landscape: { width: 1024, height: 768 } },
  { name: "Desktop",   portrait: { width: 900, height: 1200 }, landscape: { width: 1440, height: 900 } },
];

const HARD_ERROR_TEXT = /Video unavailable|Couldn['’]t find this account|Page not found/i;

/**
 * Harness matches SportLivePlayer's fullscreen behaviour:
 *   - `#box` is the fullscreen target and is styled `:fullscreen` to fill 100%
 *     of the fullscreen surface, keeping the 9:16 auto-fit cap.
 *   - ResizeObserver watches `#box` and bumps `__nonce` + reloads `src` on any
 *     real orientation flip (not on the initial mount).
 */
function harnessHtml(embedUrl: string): string {
  return `<!doctype html><html><head><style>
    html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui}
    #area{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box}
    #box{position:relative;width:100%;max-width:min(100%, calc((100vh - 8rem) * 9 / 16));aspect-ratio:9/16;overflow:hidden;border-radius:12px;background:#111}
    /* In fullscreen the box must fit the fullscreen surface with the same 9:16 auto-fit cap. */
    #box:fullscreen{width:100%;height:100%;max-width:min(100vw, calc(100vh * 9 / 16));max-height:100vh;aspect-ratio:9/16;border-radius:0}
    #box iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    button{position:fixed;top:8px;right:8px;z-index:10}
  </style></head><body>
    <div id="area"><div id="box"><iframe id="live" data-nonce="0" src="${embedUrl}"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe></div></div>
    <button id="fs">FS</button>
    <script>
      window.__nonce = 0;
      window.__lastOrientation = null;
      window.__fsChanges = 0;
      const box = document.getElementById('box');
      const iframe = document.getElementById('live');
      const btn = document.getElementById('fs');
      btn.addEventListener('click', () => { box.requestFullscreen && box.requestFullscreen(); });
      document.addEventListener('fullscreenchange', () => { window.__fsChanges += 1; });
      const ro = new ResizeObserver(() => {
        const r = box.getBoundingClientRect();
        const orientation = r.height >= r.width ? 'portrait' : 'landscape';
        if (window.__lastOrientation !== null && window.__lastOrientation !== orientation) {
          window.__nonce += 1;
          iframe.setAttribute('data-nonce', String(window.__nonce));
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
      fsElement: document.fullscreenElement?.id ?? null,
      fsChanges: (window as unknown as { __fsChanges: number }).__fsChanges,
    };
  });
}

function assertFitsViewport(
  layout: { width: number; height: number; viewport: { w: number; h: number } },
  device: string,
  phase: string,
) {
  expect(
    layout.width,
    `${device} ${phase}: container width ${layout.width} exceeds viewport ${layout.viewport.w}`,
  ).toBeLessThanOrEqual(layout.viewport.w + 1);
  expect(
    layout.height,
    `${device} ${phase}: container height ${layout.height} exceeds viewport ${layout.viewport.h}`,
  ).toBeLessThanOrEqual(layout.viewport.h + 1);
  expect(layout.width, `${device} ${phase}: container collapsed`).toBeGreaterThan(40);
  expect(layout.height, `${device} ${phase}: container collapsed`).toBeGreaterThan(40);
}

function assertPortraitAspect(
  layout: { ratio: number },
  device: string,
  phase: string,
) {
  expect(
    layout.ratio,
    `${device} ${phase}: expected 9:16 aspect, got h/w=${layout.ratio.toFixed(3)}`,
  ).toBeGreaterThan(16 / 9 - 0.09);
  expect(layout.ratio).toBeLessThan(16 / 9 + 0.09);
}

async function assertEmbedOk(page: Page, device: string, phase: string) {
  const frame = page.frameLocator("#live");
  await page.waitForTimeout(2500);
  const bodyText = (await frame.locator("body").innerText().catch(() => "")) || "";
  expect(
    bodyText,
    `${device} ${phase}: TikTok live embed rendered a hard-error page: "${bodyText.slice(0, 160)}"`,
  ).not.toMatch(HARD_ERROR_TEXT);
}

async function enterFullscreen(page: Page, device: string) {
  // requestFullscreen requires a user gesture — click satisfies it under Playwright.
  await page.locator("#fs").click();
  // Some engines resolve fullscreenchange asynchronously.
  await page.waitForFunction(
    () => document.fullscreenElement?.id === "box",
    undefined,
    { timeout: 5_000 },
  ).catch(() => {
    // WebKit headless may reject requestFullscreen — skip cleanly instead of flaking.
    throw new Error(`${device}: browser refused element.requestFullscreen()`);
  });
}

test.describe("TikTok LIVE auto-fit across orientation flips while in fullscreen", () => {
  test.setTimeout(90_000);

  for (const dev of DEVICES) {
    test(`${dev.name}: fullscreen + rotate keeps 9:16 auto-fit & remounts iframe`, async ({
      page,
      browserName,
    }) => {
      // Portrait first — load and verify the embed responded OK.
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

      await page.waitForTimeout(150);

      // Enter fullscreen BEFORE any rotation — this is the scenario under test.
      try {
        await enterFullscreen(page, dev.name);
      } catch (err) {
        // If this engine truly can't do element fullscreen (very rare in modern
        // Playwright), fail loudly instead of silently passing.
        throw err;
      }
      await page.waitForTimeout(200);

      const fsPortrait = await readLayout(page);
      expect(
        fsPortrait.fsElement,
        `${dev.name}: #box must be the fullscreen element`,
      ).toBe("box");
      expect(
        fsPortrait.windowNonce,
        `${dev.name}: entering fullscreen without orientation flip must not bump nonce`,
      ).toBe(0);
      assertPortraitAspect(fsPortrait, dev.name, "fs portrait #1");
      assertFitsViewport(fsPortrait, dev.name, "fs portrait #1");
      await assertEmbedOk(page, dev.name, "fs portrait #1");

      // Rotate to landscape WHILE fullscreen — the critical case.
      await page.setViewportSize(dev.landscape);
      await page.waitForTimeout(500);
      const fsLandscape = await readLayout(page);
      expect(
        fsLandscape.fsElement,
        `${dev.name}: rotation must not exit fullscreen`,
      ).toBe("box");
      assertPortraitAspect(fsLandscape, dev.name, "fs landscape");
      assertFitsViewport(fsLandscape, dev.name, "fs landscape");
      expect(
        fsLandscape.windowNonce,
        `${dev.name}: orientation flip in fullscreen must remount iframe`,
      ).toBeGreaterThanOrEqual(1);
      expect(fsLandscape.nonce).toBe(fsLandscape.windowNonce);
      await assertEmbedOk(page, dev.name, "fs landscape");

      // Rotate back to portrait, still fullscreen — must remount again and refit.
      await page.setViewportSize(dev.portrait);
      await page.waitForTimeout(500);
      const fsPortrait2 = await readLayout(page);
      expect(fsPortrait2.fsElement, `${dev.name}: still fullscreen after 2nd rotate`).toBe("box");
      assertPortraitAspect(fsPortrait2, dev.name, "fs portrait #2");
      assertFitsViewport(fsPortrait2, dev.name, "fs portrait #2");
      expect(
        fsPortrait2.windowNonce,
        `${dev.name}: rotating back to portrait in fullscreen must remount iframe again`,
      ).toBeGreaterThanOrEqual(2);
      await assertEmbedOk(page, dev.name, "fs portrait #2");
    });
  }
});
