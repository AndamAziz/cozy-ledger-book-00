import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

const EXEC = "/nix/store/wzfqrpwxk230xqjl1z27h7lis19gjs4f-playwright-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  ...base,
  projects: [
    { name: "chromium", use: { launchOptions: { executablePath: EXEC } } },
  ],
});
