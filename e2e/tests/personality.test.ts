import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Personality Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/personality");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Personality heading", async () => {
    await waitForText(page, "Personality");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Personality");
  });

  it("should display SOUL.md description", async () => {
    await waitForText(page, "SOUL.md");
  });

  it("should display the SOUL.md content", async () => {
    // The mock read_soul returns content with "Atlas" and "General Assistant"
    await waitForText(page, "Atlas");
  });

  it("should display the SOUL.md in a pre block", async () => {
    const preExists = await exists(page, "pre", 5_000);
    assert.ok(preExists, "SOUL.md content should be in a <pre> block");
  });

  it("should have an Edit button", async () => {
    await waitForText(page, "Edit");
    const editBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim() === "Edit") || null;
    });
    assert.ok(editBtn, "Edit button should exist");
  });

  it("should switch to edit mode when Edit is clicked", async () => {
    // Click Edit button
    const editBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim() === "Edit") || null;
    });
    await (editBtn as any).click();

    // Wait for edit mode to appear
    await waitForText(page, "Edit Personality");
    await waitForText(page, "Cancel");
    await waitForText(page, "Save");
  });

  it("should show name input in edit mode", async () => {
    const nameInput = await page.waitForSelector("#agent-name", { timeout: 5_000 });
    assert.ok(nameInput, "Name input should be visible in edit mode");
  });

  it("should show role options in edit mode", async () => {
    await waitForText(page, "Role");
    await waitForText(page, "General Assistant");
  });

  it("should show Cancel button that returns to view mode", async () => {
    const cancelBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim() === "Cancel") || null;
    });
    await (cancelBtn as any).click();

    // Should return to view mode
    await waitForText(page, "SOUL.md");
    await waitForText(page, "Edit");
  });
});
