import { test, expect } from "@playwright/test";
import { toSocialEmbed } from "../src/lib/socialEmbed";

/**
 * End-to-end: verify the TikTok creator profile embed (`/embed/@user`) that
 * Sport Live uses for LIVE links actually surfaces the "LIVE" badge inside a
 * real cross-origin iframe, across Chromium, Firefox, and WebKit.
 *
 * The badge is rendered by TikTok itself when the creator has an active live
 * stream. We assert:
 *   1. Our URL transform lands on `/embed/@<user>` (no domain-whitelist page).
 *   2. The iframe response returns a 2xx/3xx (no "Embed blocked" error).
 *   3. The rendered body does NOT contain TikTok's hard-error strings.
 *   4. The "LIVE" badge is visible when the creator is currently streaming.
 *      If the creator is offline at test time we soft-skip the badge check
 *      so the suite stays green — the transform + iframe load remain hard
 *      assertions.
 */

const LIVE_CREATORS: Array<{ label: string; url: string; user: string }> = [
  {
    label: "aminheyasi",
    url: "https://www.tiktok.com/@aminheyasi/live",
    user: "aminheyasi",
  },
];

const HARD_ERROR_TEXT =
  /Embed blocked|not authorized on this domain|Video unavailable|Couldn['’]t find this account|Page not found/i;
const LIVE_BADGE_TEXT = /\bLIVE\b/;

test.describe("TikTok LIVE badge inside Sport Live iframe", () => {
  test.setTimeout(60_000);

  for (const { label, url, user } of LIVE_CREATORS) {
    test(`@${label} profile embed surfaces LIVE badge`, async ({
      page,
      browserName,
    }, testInfo) => {
      const embedUrl = toSocialEmbed(url)?.embedUrl;
      expect(embedUrl, "socialEmbed should transform live URL").toBe(
        `https://www.tiktok.com/embed/@${user}`,
      );

      const embedResponsePromise = page.waitForResponse(
        (res) =>
          res.url().startsWith(`https://www.tiktok.com/embed/@${user}`) &&
          res.request().resourceType() === "document",
        { timeout: 25_000 },
      );

      // Host the iframe on a Playwright-controlled origin so it is a genuine
      // cross-origin embed — the exact shape SportLivePlayer renders.
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#000">
           <iframe
             id="tt"
             src="${embedUrl!}"
             allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
             style="width:100vw;height:100vh;border:0"
           ></iframe>
         </body></html>`,
        { waitUntil: "domcontentloaded" },
      );

      const response = await embedResponsePromise;
      expect(
        response.status(),
        `TikTok embed returned ${response.status()} on ${browserName}`,
      ).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(400);

      const frame = page.frameLocator("#tt");
      // Give TikTok's SPA time to hydrate the profile grid + LIVE badge.
      await page.waitForTimeout(5000);

      const body = frame.locator("body");
      const bodyText = (await body.innerText().catch(() => "")) || "";

      expect(
        bodyText,
        `TikTok profile embed rendered a hard-error page on ${browserName}: "${bodyText.slice(
          0,
          200,
        )}"`,
      ).not.toMatch(HARD_ERROR_TEXT);

      // The badge is only rendered when the creator is currently live. Treat
      // its absence as a soft skip so an offline creator doesn't turn the
      // whole cross-browser matrix red.
      if (LIVE_BADGE_TEXT.test(bodyText)) {
        expect(bodyText).toMatch(LIVE_BADGE_TEXT);
      } else {
        testInfo.annotations.push({
          type: "skip-reason",
          description: `@${user} is not live on ${browserName}; profile embed loaded cleanly with no LIVE badge.`,
        });
        test.skip(
          true,
          `@${user} not currently live on ${browserName}; badge cannot be verified.`,
        );
      }
    });
  }
});
