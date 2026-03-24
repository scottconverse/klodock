import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Channels Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/channels");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Channels heading", async () => {
    await waitForText(page, "Channels");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Channels");
  });

  it("should display WebChat card", async () => {
    await waitForText(page, "WebChat (Built-in)");
    await waitForText(page, "Always available");
  });

  it("should have an Open button for WebChat", async () => {
    const openBtn = await page.waitForSelector('button[aria-label="Open WebChat"]', {
      timeout: 5_000,
    });
    assert.ok(openBtn, "WebChat Open button should exist");
  });

  it("should display Telegram channel card", async () => {
    await waitForText(page, "Telegram");
  });

  it("should display Discord channel card", async () => {
    await waitForText(page, "Discord");
  });

  it("should show Telegram as expandable", async () => {
    // Look for the expand button for Telegram
    const telegramBtn = await page.waitForSelector(
      'button[aria-label*="Telegram"]',
      { timeout: 5_000 },
    );
    assert.ok(telegramBtn, "Telegram expandable button should exist");

    const expanded = await telegramBtn!.evaluate((el) => el.getAttribute("aria-expanded"));
    assert.equal(expanded, "false", "Telegram should start collapsed");
  });

  it("should expand Telegram when clicked", async () => {
    const telegramBtn = await page.waitForSelector(
      'button[aria-label*="Telegram"]',
      { timeout: 5_000 },
    );
    await telegramBtn!.click();

    // Wait for expanded content
    await waitForText(page, "Telegram is a free messaging app");
  });

  it("should show Telegram instructions when expanded", async () => {
    // Should already be expanded from previous test
    await waitForText(page, "bot token");
  });

  it("should show token input for Telegram when expanded", async () => {
    const tokenInput = await page.waitForSelector("#token-telegram", { timeout: 5_000 });
    assert.ok(tokenInput, "Token input for Telegram should be visible");
  });

  it("should collapse Telegram when clicked again", async () => {
    const telegramBtn = await page.waitForSelector(
      'button[aria-label*="Telegram"]',
      { timeout: 5_000 },
    );
    await telegramBtn!.click();

    // The token input should no longer be visible
    await page.waitForFunction(
      () => !document.querySelector("#token-telegram"),
      { timeout: 3_000 },
    );
  });

  it("should show Discord as expandable", async () => {
    const discordBtn = await page.waitForSelector(
      'button[aria-label*="Discord"]',
      { timeout: 5_000 },
    );
    assert.ok(discordBtn, "Discord expandable button should exist");
  });

  it("should expand Discord when clicked", async () => {
    const discordBtn = await page.waitForSelector(
      'button[aria-label*="Discord"]',
      { timeout: 5_000 },
    );
    await discordBtn!.click();

    await waitForText(page, "Discord is a chat platform");
  });

  it("should show Recommended badge on Telegram", async () => {
    await waitForText(page, "Recommended");
  });
});
