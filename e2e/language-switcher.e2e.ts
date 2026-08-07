import { test, expect, devices } from "@playwright/test";

/**
 * Regression coverage for the header language switcher.
 *
 * Guards against the dropdown trigger losing its ref (which silently breaks
 * opening the menu) and against layout overflow in RTL languages.
 * Runs on both a desktop and a mobile viewport.
 */

const LANGUAGES = [
  { label: "کوردی", htmlLang: "ckb", dir: "rtl", stored: "ku" },
  { label: "English", htmlLang: "en", dir: "ltr", stored: "en" },
  { label: "العربية", htmlLang: "ar", dir: "rtl", stored: "ar" },
  { label: "فارسی", htmlLang: "fa", dir: "rtl", stored: "fa" },
  { label: "Türkçe", htmlLang: "tr", dir: "ltr", stored: "tr" },
];

const STORAGE_KEY = "central-tech-platform-language";

const viewports = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: devices["Pixel 7"].viewport },
];

for (const { name, viewport } of viewports) {
  test.describe(`language switcher – ${name}`, () => {
    test.use({ viewport });

    test("switches every language without dropdown or layout errors", async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto("/", { waitUntil: "domcontentloaded" });

      // Dismiss the first-visit onboarding overlay when it is shown.
      const skip = page.getByRole("button", { name: /^Skip$/ });
      if (await skip.isVisible().catch(() => false)) {
        await skip.click();
      }

      const trigger = page.locator('button[aria-label^="Select language"]');
      await expect(trigger).toBeVisible();

      for (const lang of LANGUAGES) {
        await trigger.click();
        const item = page.getByRole("menuitem", { name: new RegExp(lang.label) });
        await expect(item).toBeVisible();
        await item.click();

        await expect
          .poll(() => page.evaluate(() => document.documentElement.lang))
          .toBe(lang.htmlLang);

        expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang.dir);
        expect(
          await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
        ).toBe(lang.stored);

        // No horizontal overflow in either text direction.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      }

      expect(pageErrors).toEqual([]);
    });
  });
}
