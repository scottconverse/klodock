import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Updates Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/updates");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Updates heading", async () => {
    await waitForText(page, "Updates");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Updates");
  });

  it("should display KloDock version indicator", async () => {
    // The version is shown as "v{version}" — the mock may return "1.2.0" or
    // the Tauri API may fall back to "unknown". Either way a "v" prefix exists.
    const versionText = await page.evaluate(() => {
      const spans = document.querySelectorAll("span.font-mono");
      return Array.from(spans).map((s) => s.textContent?.trim());
    });
    const hasVersion = versionText.some((t) => t?.startsWith("v"));
    assert.ok(hasVersion, "Should display a version string starting with 'v'");
  });

  it("should display KloDock section", async () => {
    await waitForText(page, "KloDock");
    await waitForText(page, "Desktop application");
  });

  it("should display OpenClaw section", async () => {
    await waitForText(page, "OpenClaw");
    await waitForText(page, "AI agent framework");
  });

  it("should show OpenClaw version", async () => {
    // The mock returns current_version: "0.9.0"
    await waitForText(page, "0.9.0");
  });

  it("should have a Check for updates button", async () => {
    const checkBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.includes("Check for updates")) || null;
    });
    assert.ok(checkBtn, "Check for updates button should exist");
  });

  it("should show up-to-date status when no updates available", async () => {
    // Mock returns update_available: false
    await waitForText(page, "Up to date");
  });

  it("should display Resources section", async () => {
    await waitForText(page, "Resources");
    await waitForText(page, "OpenClaw Documentation");
    await waitForText(page, "ClawHub Skill Registry");
  });

  it("should handle Check for updates click", async () => {
    const checkBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.includes("Check for updates")) || null;
    });
    await (checkBtn as any).click();

    // Should show "Checking..." temporarily
    // Then resolve back to up-to-date
    await waitForText(page, "Up to date");
  });
});
