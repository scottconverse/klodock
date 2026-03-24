import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Overview Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Overview heading", async () => {
    await waitForText(page, "Overview");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Overview");
  });

  it("should display subheading text", async () => {
    await waitForText(page, "Your agent at a glance.");
  });

  it("should display Health Checks section", async () => {
    await waitForText(page, "Health Checks");
  });

  it("should show daemon running status", async () => {
    await waitForText(page, "Agent daemon running");
  });

  it("should show API key valid status", async () => {
    await waitForText(page, "API key valid");
  });

  it("should display quick stats cards (Online, Channels count, Issues count)", async () => {
    await waitForText(page, "Online");
    // The stats cards show numeric values: channel count (0) and issues count (0)
    const cardTexts = await page.evaluate(() => {
      const cards = document.querySelectorAll(".text-2xl");
      return Array.from(cards).map((el) => el.textContent?.trim());
    });
    assert.ok(cardTexts.includes("Online"), "Should show Online status");
    assert.ok(cardTexts.includes("0"), "Should show numeric counts");
  });

  it("should show Online status when daemon is running", async () => {
    await waitForText(page, "Online");
  });

  it("should display Stop Agent button when daemon is running", async () => {
    const stopBtn = await page.waitForSelector('button[aria-label="Stop your agent"]', {
      timeout: 5_000,
    });
    assert.ok(stopBtn, "Stop Agent button should be visible");
    const text = await stopBtn!.evaluate((el) => el.textContent?.trim());
    assert.ok(text?.includes("Stop Agent"), "Button should say Stop Agent");
  });

  it("should display Restart Agent button when daemon is running", async () => {
    const restartBtn = await page.waitForSelector('button[aria-label="Restart your agent"]', {
      timeout: 5_000,
    });
    assert.ok(restartBtn, "Restart Agent button should be visible");
    const text = await restartBtn!.evaluate((el) => el.textContent?.trim());
    assert.ok(text?.includes("Restart Agent"), "Button should say Restart Agent");
  });

  it("should display Open Chat button when daemon is running", async () => {
    const chatBtn = await page.waitForSelector('button[aria-label="Open chat with your agent"]', {
      timeout: 5_000,
    });
    assert.ok(chatBtn, "Open Chat button should be visible");
  });

  it("should navigate to chat when Open Chat is clicked", async () => {
    const chatBtn = await page.waitForSelector('button[aria-label="Open chat with your agent"]', {
      timeout: 5_000,
    });
    await chatBtn!.click();
    await page.waitForNetworkIdle({ timeout: 5_000 });
    const url = new URL(page.url());
    assert.equal(url.pathname, "/dashboard/chat");
    // Navigate back for subsequent tests
    await navigateTo(page, "/dashboard");
  });

  it("should display Recent Activity section", async () => {
    await waitForText(page, "Recent Activity");
  });

  it("should show activity log entries", async () => {
    // The mock returns activity entries
    const logEl = await page.waitForSelector('[role="log"]', { timeout: 5_000 });
    assert.ok(logEl, "Activity log element should exist");

    // Check for at least one activity entry
    await waitForText(page, "Agent started");
  });

  it("should have a refresh activity button", async () => {
    const refreshBtn = await page.waitForSelector('button[aria-label="Refresh activity log"]', {
      timeout: 5_000,
    });
    assert.ok(refreshBtn, "Refresh activity button should exist");
  });
});
