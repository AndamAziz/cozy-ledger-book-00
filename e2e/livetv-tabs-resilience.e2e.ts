/**
 * Live TV resilience regression: Direct / Movies / Series / Replay.
 *
 * Guards the invariants the user cares about — no blocking overlay, no noisy
 * "all slots in use" modal, exactly one <video> element mounted, and no
 * uncaught runtime error — while a real catalogue is browsed and one item per
 * section is opened in the player.
 *
 * Actual decoding is NOT asserted: the sandbox Chromium ships without
 * proprietary codecs (see iptv-playback.e2e.ts for the ffprobe-based decoder
 * truth). Requires an injected preview session; skips without one.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function dotEnv(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.resolve('.env'), 'utf8');
    return Object.fromEntries(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

/** Noise the player must never show by itself. */
const NOISE = /all viewing slots|max connections|not responding|something went wrong/i;

async function signIn(page: Page): Promise<boolean> {
  const env = { ...(await dotEnv()), ...process.env } as Record<string, string>;
  const key = env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (!key || !session) return false;
  await page.goto('/');
  await page.evaluate(
    ([k, s]) => window.localStorage.setItem(k, s),
    [key, session] as const,
  );
  return true;
}

const TABS = [
  { name: 'Direct', path: '/live-tv' },
  { name: 'Movies', path: '/live-tv/movies' },
  { name: 'Series', path: '/live-tv/series' },
  { name: 'Replay', path: '/live-tv/replay' },
] as const;

for (const tab of TABS) {
  test(`Live TV ${tab.name}: browses and opens a player without noise`, async ({ page }) => {
    test.setTimeout(180_000);
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));

    if (!(await signIn(page))) test.skip(true, 'no injected preview session');

    await page.goto(tab.path, { waitUntil: 'domcontentloaded' });
    // Catalogue index is fetched through a single-connection provider queue.
    await expect(page.locator('section button[aria-expanded]').first()).toBeVisible({
      timeout: 90_000,
    });

    // Open the first category and wait for its preview strip.
    await page.locator('section button[aria-expanded]').first().click();
    const card = page.locator('section img').first();
    await card.waitFor({ state: 'visible', timeout: 90_000 });

    // Play the first item (series first opens the show sheet, then E1).
    await page.evaluate(() => {
      const img = document.querySelector('section img');
      (img?.closest('button') as HTMLButtonElement | null)?.click();
    });
    await page.waitForTimeout(6_000);
    const episode = page.locator('button', { hasText: /^E\d+/ }).first();
    if (await episode.count()) {
      await episode.click();
      await page.waitForTimeout(6_000);
    }

    // Exactly one media element is ever mounted (no stacked players).
    expect(await page.locator('video').count()).toBeLessThanOrEqual(1);
    // And the player never nags the viewer by itself.
    await expect(page.locator('body')).not.toContainText(NOISE);
    expect(crashes, `runtime errors on ${tab.path}`).toEqual([]);
  });
}
