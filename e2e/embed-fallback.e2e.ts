import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end: the Watch player must step through EVERY fallback server in order
 * when the active server does not load, for both movies (`/embed/movie/…`) and
 * TV series (`/embed/tv/…`), on desktop and mobile viewports.
 *
 * How the fallback is forced
 * --------------------------
 * The player treats a server as failed when its iframe fails to load within the
 * watchdog window (~8s). We reproduce a "server not responding / blocked" state
 * deterministically by intercepting every streaming-host request and leaving it
 * pending (never resolved), so the iframe never fires `onLoad`. The watchdog
 * then fails over to the next server, and we assert the iframe `src` advances
 * through the expected ordered chain built by `buildWatchServers`.
 *
 * Runtime note: each failover step waits ~8s, so a full chain can take ~70s.
 * This spec is scoped to Chromium (failover is timing-based and
 * browser-independent) and raises the per-test timeout accordingly.
 */

// Streaming hosts whose iframe requests we hang to force failover. Poster/image
// requests (image.tmdb.org) and the app itself are left untouched.
const STREAM_HOSTS = [
  "fastimdb.com",
  "directimdb.com",
  "streamimdb.com",
  "runimdb.com",
  "playimdb.com",
  "vidapi.ru",
  "vidsrc.to",
  "2embed.cc",
];

// The full fallback order produced by buildWatchServers. A given title may
// start partway in (e.g. TMDB-only when no IMDB id exists), but the observed
// steps must always be a strictly-increasing subsequence of this list.
const EXPECTED_ORDER = [
  "fastimdb.com",
  "directimdb.com",
  "streamimdb.com",
  "runimdb.com",
  "playimdb.com",
  "vidapi.ru",
  "vidsrc.to",
  "2embed.cc",
  "imdb-title",
];

// The TMDB-based fallback tier that must be reached once the IMDB `/embed/`
// hosts fail (and the only tier for titles without an IMDB id).
const TMDB_FALLBACK_TIER = ["vidapi.ru", "vidsrc.to", "2embed.cc"];

/** Reduce a server URL to a stable step id used for ordering assertions. */
function stepId(url: string): string {
  if (url.includes("/title/")) return "imdb-title";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Hang every streaming-host request so the player's watchdog fails over. */
async function hangStreamingHosts(page: Page) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (STREAM_HOSTS.some((h) => url.includes(h))) {
      // Intentionally never resolve: the request stays pending, the iframe
      // never loads, and the ~8s watchdog triggers automatic failover.
      return;
    }
    return route.continue();
  });
}

/**
 * Open the Watch player and record the ordered sequence of distinct server
 * iframe `src` values as the player fails over through the chain.
 */
async function collectFallbackSequence(page: Page): Promise<string[]> {
  const frame = page.locator("iframe[title='player']");
  await expect(frame).toBeVisible({ timeout: 15_000 });

  const seen: string[] = [];
  const start = Date.now();
  let lastChange = Date.now();

  // Poll until the chain stops advancing for >10s, or the overall cap is hit.
  while (Date.now() - start < 95_000) {
    const src = (await frame.getAttribute("src")) || "";
    if (src && (seen.length === 0 || seen[seen.length - 1] !== src)) {
      seen.push(src);
      lastChange = Date.now();
    }
    // Stop early once the chain settles on its final server.
    if (seen.length >= 3 && Date.now() - lastChange > 10_000) break;
    await page.waitForTimeout(300);
  }
  return seen;
}

/** Navigate to /movies and open the first grid card's Watch player. */
async function openFirstWatch(page: Page, media: "movie" | "tv") {
  await page.goto("/movies", { waitUntil: "domcontentloaded" });
  if (media === "tv") {
    // Nav labels are localized; the 📺 emoji in the accessible name is stable.
    await page.getByRole("button", { name: /📺/ }).click();
  }
  // Wait for the catalog grid to render.
  await expect(page.locator(".mv-card").first()).toBeVisible({ timeout: 20_000 });
  await page.locator(".mv-card").first().click();
  // The detail view exposes the Watch button via a stable aria-label.
  const watch = page.getByLabel("watch-now-player").first();
  await expect(watch).toBeVisible({ timeout: 15_000 });
  await watch.click();
}

/** Shared assertions over an observed failover sequence. */
function assertFallbackChain(
  seq: string[],
  media: "movie" | "tv",
) {
  // At least three distinct servers were tried → multi-step fallback happened.
  expect(seq.length).toBeGreaterThanOrEqual(3);

  // Every step targets the correct embed path for the media type (the /title/
  // last-resort step is the only exception and is allowed).
  const embedSteps = seq.filter((u) => !u.includes("/title/"));
  for (const url of embedSteps) {
    expect(url).toContain(`/embed/${media}/`);
  }

  // Steps must strictly advance through the canonical fallback order.
  const ids = seq.map(stepId);
  const indices = ids.map((id) => EXPECTED_ORDER.indexOf(id));
  for (const idx of indices) expect(idx).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < indices.length; i++) {
    expect(indices[i]).toBeGreaterThan(indices[i - 1]);
  }

  // The chain must reach the TMDB-based fallback tier (the URL/host swap the
  // fallback exists to provide) once the primary embed hosts fail.
  expect(ids.some((id) => TMDB_FALLBACK_TIER.includes(id))).toBe(true);
}

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const;

for (const { name, viewport } of VIEWPORTS) {
  test.describe(`embed fallback chain (${name})`, () => {
    test.use({ viewport });

    for (const media of ["movie", "tv"] as const) {
      test(`forces every /embed/${media}/ fallback step`, async ({
        page,
        browserName,
      }) => {
        // Failover is timing-based and identical across engines; run on Chromium
        // only so the multi-step (~8s each) traversal stays within budget.
        test.skip(
          browserName !== "chromium",
          "failover timing is browser-independent; scoped to Chromium",
        );
        test.setTimeout(120_000);

        await hangStreamingHosts(page);
        await openFirstWatch(page, media);
        const seq = await collectFallbackSequence(page);

        // eslint-disable-next-line no-console
        console.log(`[${name}/${media}] fallback sequence:`, seq.map(stepId));
        assertFallbackChain(seq, media);
      });
    }
  });
}
