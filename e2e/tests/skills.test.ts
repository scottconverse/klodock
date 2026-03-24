import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Skills Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/skills");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Skills heading", async () => {
    await waitForText(page, "Skills");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Skills");
  });

  it("should display skill count summary", async () => {
    // The mock returns 53 skills with 18 eligible
    await waitForText(page, "53 skills");
    await waitForText(page, "18 are active");
  });

  it("should have a search input", async () => {
    const searchInput = await page.waitForSelector('input[aria-label="Search skills"]', {
      timeout: 5_000,
    });
    assert.ok(searchInput, "Search input should exist");
  });

  it("should have search placeholder text", async () => {
    const placeholder = await page.$eval(
      'input[aria-label="Search skills"]',
      (el) => (el as HTMLInputElement).placeholder,
    );
    assert.ok(placeholder.includes("Search skills"), "Should have search placeholder");
  });

  it("should display category filter chips", async () => {
    // Check for the "All" chip with total count
    await waitForText(page, "All (53)");

    // Check for some category chips
    const categoryNames = [
      "Communication", "Productivity", "Developer Tools",
      "Media & Audio", "Smart Home", "AI Services",
    ];
    for (const name of categoryNames) {
      await waitForText(page, name);
    }
  });

  it("should filter skills when searching", async () => {
    const searchInput = await page.waitForSelector('input[aria-label="Search skills"]', {
      timeout: 5_000,
    });
    await searchInput!.click({ clickCount: 3 }); // select all
    await searchInput!.type("telegram");

    // Wait for filter to apply
    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll("h4");
        return cards.length > 0 && cards.length < 52;
      },
      { timeout: 5_000 },
    );

    await waitForText(page, "Telegram");

    // Clear search
    await searchInput!.click({ clickCount: 3 });
    await searchInput!.type("");
    await page.keyboard.press("Backspace");
  });

  it("should display safety badges on skill cards", async () => {
    // Clear search first
    const searchInput = await page.waitForSelector('input[aria-label="Search skills"]', {
      timeout: 5_000,
    });
    await searchInput!.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");

    // Wait for skills to load
    await waitForText(page, "53 skills");

    // Safety badges should be visible (the SafetyBadge component renders these)
    const hasBadges = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("Verified") || text.includes("Community") || text.includes("Unreviewed");
    });
    assert.ok(hasBadges, "Safety badges should be visible on skill cards");
  });

  it("should render individual skill cards with names and descriptions", async () => {
    // Check that at least one skill card has a name (h4 element)
    const cardCount = await page.$$eval("h4", (els) => els.length);
    assert.ok(cardCount > 0, "Should render skill cards with h4 headings");
  });

  it("should show Active badge on eligible skills", async () => {
    await waitForText(page, "Active");
  });

  it("should have Check again button", async () => {
    await waitForText(page, "Check again");
  });

  it("should have Browse ClawHub button", async () => {
    await waitForText(page, "Browse ClawHub");
  });
});
