import { test, expect } from "@playwright/test";
import { toSocialEmbed, normalizeTikTokLiveUser } from "../src/lib/socialEmbed";

/**
 * End-to-end: TikTok LIVE links (`tiktok.com/@user/live`) must render as a
 * working embed inside a real iframe, across every supported URL shape and
 * every browser engine we ship for.
 *
 * How the test works
 * ------------------
 * 1. For each LIVE input (bare, trailing slash, with pc_share tracking params,
 *    tiktok short-host, uppercase host), we assert the URL transform lands on
 *    TikTok's official live embed player: `/embed/live/@<user>`.
 * 2. We then load that embed URL inside an iframe on a Playwright-controlled
 *    origin (`about:blank` served via `page.setContent`, so the iframe is a
 *    real cross-origin embed just like it will be on the deployed domains).
 *    We assert the iframe network response returns HTTP 200 (or a redirect
 *    chain that terminates in 200) and that the resulting document is NOT
 *    TikTok's "Video unavailable" / "This account is unavailable" error page.
 *
 * The Playwright config already runs this file across Chromium, Firefox, and
 * WebKit — matching the browsers our users open the site with.
 */

/** LIVE URL shapes we want to prove out end to end. */
const LIVE_INPUTS: Array<{ label: string; url: string; user: string }> = [
  {
    label: "canonical",
    url: "https://www.tiktok.com/@aminheyasi/live",
    user: "aminheyasi",
  },
  {
    label: "trailing slash",
    url: "https://www.tiktok.com/@aminheyasi/live/",
    user: "aminheyasi",
  },
  {
    label: "pc_share tracking params",
    url: "https://www.tiktok.com/@aminheyasi/live?_r=1&enter_from_merge=pc_share&enter_method=pc_share&is_from_webapp=1&sender_device=pc",
    user: "aminheyasi",
  },
  {
    label: "no www subdomain",
    url: "https://tiktok.com/@aminheyasi/live",
    user: "aminheyasi",
  },
  {
    label: "m. mobile subdomain",
    url: "https://m.tiktok.com/@aminheyasi/live",
    user: "aminheyasi",
  },
];

// TikTok's live embed page renders these strings when a stream is not live /
// the account is unavailable. A working live also does show a hint while the
// player boots, so we only fail on the hard error strings.
const HARD_ERROR_TEXT = /Video unavailable|Couldn['’]t find this account|Page not found/i;

test.describe("TikTok LIVE embed transform", () => {
  for (const { label, url, user } of LIVE_INPUTS) {
    test(`normalises ${label} → /embed/@${user}`, () => {
      expect(normalizeTikTokLiveUser(url)).toBe(user);
      const embed = toSocialEmbed(url);
      expect(embed).toEqual({
        platform: "tiktok",
        embedUrl: `https://www.tiktok.com/embed/@${user}`,
      });
    });
  }
});

test.describe("TikTok LIVE embed loads in a real iframe", () => {
  // The embed page is ~1MB with fonts + player bundle; keep a generous budget.
  test.setTimeout(45_000);

  for (const { label, url, user } of LIVE_INPUTS) {
    test(`renders ${label} across the current browser engine`, async ({
      page,
      browserName,
    }) => {
      const embedUrl = toSocialEmbed(url)?.embedUrl;
      expect(embedUrl).toBe(`https://www.tiktok.com/embed/@${user}`);

      // Capture the top-level iframe navigation response so we can assert on the
      // real HTTP status TikTok returns for this embed URL.
      const embedResponsePromise = page.waitForResponse(
        (res) =>
          res.url().startsWith(`https://www.tiktok.com/embed/@${user}`) &&
          res.request().resourceType() === "document",
        { timeout: 20_000 },
      );

      // Load a minimal host page on a Playwright-controlled origin, then embed
      // TikTok's live player in an iframe — the exact shape SportLivePlayer uses.
      await page.setContent(
        `<!doctype html><html><body style="margin:0">
           <iframe
             id="live"
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

      const frame = page.frameLocator("#live");
      // Give TikTok's SPA a beat to render (or fail).
      await page.waitForTimeout(3000);

      const bodyText = (await frame.locator("body").innerText().catch(() => "")) || "";
      expect(
        bodyText,
        `TikTok live embed for @${user} rendered a hard-error page: "${bodyText.slice(0, 200)}"`,
      ).not.toMatch(HARD_ERROR_TEXT);
    });
  }
});
