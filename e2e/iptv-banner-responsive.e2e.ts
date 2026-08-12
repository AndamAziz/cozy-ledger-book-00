import { test, expect } from "@playwright/test";

/**
 * End-to-end: the /iptv banner must stay visually locked across every screen
 * size (mobile → 10-foot TV UI).
 *
 * Global CSS in src/index.css scales the root font-size and enforces a
 * `min-height` on buttons above 1600px, which previously made the banner grow
 * on large displays. The banner therefore uses absolute pixel sizing, and this
 * spec guards that contract:
 *   1. Banner height is exactly 42px on every viewport.
 *   2. Its content is limited to the title, the LIVE badge and the channel
 *      counter — no playlist name and no category/group text.
 *   3. The TV icon badge (24px) and the back button (28px) never scale up.
 *   4. Icon + text stay vertically centred (matching centre lines).
 *   5. The banner is sticky at the top and never overflows horizontally.
 */

const VIEWPORTS = [
  { name: "mobile", width: 384, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "tv", width: 1920, height: 1080 },
] as const;

for (const vp of VIEWPORTS) {
  test(`/iptv banner is locked at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/iptv", { waitUntil: "domcontentloaded" });

    const banner = page.getByTestId("iptv-banner");
    await expect(banner).toBeVisible();

    // 1. Fixed 42px height regardless of root font-size scaling.
    const box = (await banner.boundingBox())!;
    expect(Math.round(box.height)).toBe(48);

    // 2. Minimal content only.
    const text = ((await banner.innerText()) || "").replace(/\s+/g, " ").trim();
    expect(text).toMatch(/LIVE/i);
    expect(text).toMatch(/\d/); // channel counter
    expect(text).not.toMatch(/categor/i);
    expect(text).not.toMatch(/·/);

    // 3. Inner control sizes are absolute.
    const sizes = await banner.evaluate((el) => {
      const back = el.querySelector("button")!;
      const iconBadge = el.querySelector("span.rounded-full")!;
      const r1 = back.getBoundingClientRect();
      const r2 = iconBadge.getBoundingClientRect();
      return {
        back: { h: r1.height, w: r1.width, cy: r1.top + r1.height / 2 },
        icon: { h: r2.height, w: r2.width, cy: r2.top + r2.height / 2 },
        position: getComputedStyle(el).position,
      };
    });
    expect(Math.round(sizes.back.h)).toBe(28);
    expect(Math.round(sizes.back.w)).toBe(28);
    expect(Math.round(sizes.icon.h)).toBe(24);
    expect(Math.round(sizes.icon.w)).toBe(24);

    // 4. Vertically centred against the banner centre line.
    const bannerCenter = box.y + box.height / 2;
    expect(Math.abs(sizes.back.cy - bannerCenter)).toBeLessThanOrEqual(5);
    expect(Math.abs(sizes.icon.cy - bannerCenter)).toBeLessThanOrEqual(5);

    // 5. Sticky and no horizontal overflow.
    expect(sizes.position).toBe("sticky");
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 2);
  });
}
