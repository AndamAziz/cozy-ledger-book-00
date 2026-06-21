import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end: the selected reciter must persist across a full page reload,
 * in Chromium, Firefox, and WebKit (configured as projects in
 * playwright.config.ts).
 *
 * Flow:
 *   1. Open /quran and pick the first surah (renders the reader + reciter select).
 *   2. Choose a specific reciter from the dropdown.
 *   3. Assert localStorage["quran-reciter"] holds that reciter id.
 *   4. Reload the page and re-open the same surah.
 *   5. Assert the selection survived: storage value + trigger label.
 */

const TARGET = {
  // Abdul Rahman As-Sudais — distinct from the Alafasy default.
  id: "ar.abdurrahmaansudais",
  fullName: "Abdul Rahman As-Sudais",
  shortName: "Sudais",
};

async function openFirstSurah(page: Page) {
  await page.goto("/quran");
  // Surah list buttons are numbered; the first surah is Al-Fatiha (#1).
  const firstSurah = page.locator("button", { hasText: /^1/ }).first();
  await firstSurah.click();
  // The reader exposes the reciter selector as a combobox.
  await expect(page.getByRole("combobox").first()).toBeVisible();
}

test.describe("Quran reciter persists across reload", () => {
  test("selection survives a full reload", async ({ page }) => {
    await openFirstSurah(page);

    // Open the reciter dropdown and choose the target reciter.
    await page.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: new RegExp(TARGET.fullName) })
      .click();

    // The choice is written to localStorage immediately.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("quran-reciter")))
      .toBe(TARGET.id);

    // Trigger now shows the compact label.
    await expect(page.getByRole("combobox").first()).toContainText(
      TARGET.shortName,
    );

    // Full reload — the heart of the test.
    await page.reload();

    // Storage value persisted through the reload.
    expect(
      await page.evaluate(() => localStorage.getItem("quran-reciter")),
    ).toBe(TARGET.id);

    // Re-open the surah; the reader should reflect the persisted reciter.
    await openFirstSurah(page);
    await expect(page.getByRole("combobox").first()).toContainText(
      TARGET.shortName,
    );
  });

  test("default reciter is used on a fresh visit (no stored value)", async ({
    page,
  }) => {
    await page.goto("/quran");
    await page.evaluate(() => localStorage.removeItem("quran-reciter"));
    await openFirstSurah(page);
    // Default is Alafasy — its compact label is "Alafasy".
    await expect(page.getByRole("combobox").first()).toContainText("Alafasy");
  });
});
