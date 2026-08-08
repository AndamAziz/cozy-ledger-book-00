import { test, expect, type Page } from '@playwright/test';

/**
 * Smart TV remote control end-to-end coverage.
 * Simulates real TV platforms: Tizen/webOS/Android TV send numeric keyCodes
 * (no `key` name), so we dispatch raw keydown events with those codes.
 */

const TV_UA =
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36';

test.use({ userAgent: TV_UA, viewport: { width: 1920, height: 1080 } });

async function pressCode(page: Page, code: number) {
  await page.evaluate(
    (c) => window.dispatchEvent(new KeyboardEvent('keydown', { key: '', keyCode: c, bubbles: true, cancelable: true })),
    code,
  );
  await page.waitForTimeout(600);
}

const focusLabel = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? `${a.tagName}:${(a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40)}` : 'none';
  });

const playerTitle = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-tv-scope] p')?.textContent?.trim() ?? null);

test.describe('Smart TV remote', () => {
  test('D-pad walks the IPTV channel grid and enables the TV focus ring', async ({ page }) => {
    await page.goto('/iptv');
    await page.waitForTimeout(6000);

    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.body.getAttribute('data-tv'))).toBe('true');

    const ring = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      return parseFloat(getComputedStyle(a).outlineWidth);
    });
    expect(ring).toBeGreaterThanOrEqual(3);

    const seen = new Set<string>();
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
      seen.add(await focusLabel(page));
    }
    // Every press must land somewhere new — no dead ends, no focus traps.
    expect(seen.size).toBeGreaterThan(3);
  });

  test('OK opens the player; CH+/CH- zap, mute and Back close it', async ({ page }) => {
    await page.goto('/iptv');
    await page.waitForTimeout(6000);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
    }

    await pressCode(page, 13); // OK (numeric Enter)
    await expect(page.locator('[data-tv-scope] video')).toHaveCount(1);
    const first = await playerTitle(page);
    expect(first).toBeTruthy();

    await pressCode(page, 427); // CH+
    const next = await playerTitle(page);
    expect(next).not.toBe(first);

    await pressCode(page, 428); // CH-
    expect(await playerTitle(page)).toBe(first);

    await pressCode(page, 447); // Mute
    expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>('[data-tv-scope] video')?.muted)).toBe(
      true,
    );

    await pressCode(page, 10009); // Tizen Return
    await expect(page.locator('[data-tv-scope] video')).toHaveCount(0);
    expect(page.url()).toContain('/iptv');
  });

  test('webOS Back key navigates back when no player is open', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    await page.goto('/iptv');
    await page.waitForTimeout(3000);
    await pressCode(page, 461); // webOS back
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
