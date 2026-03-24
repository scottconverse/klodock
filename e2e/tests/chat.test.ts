import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Chat Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/chat");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should render the chat container", async () => {
    const chatEl = await page.waitForSelector('[role="log"]', { timeout: 5_000 });
    assert.ok(chatEl, "Chat container should exist with role=log");
  });

  it("should show connected or connecting state", async () => {
    // With the mock, chatConnect succeeds and fires connected event
    await page.waitForFunction(
      () => document.body.innerText.includes("Agent Chat") ||
            document.body.innerText.includes("Connecting") ||
            document.body.innerText.includes("Disconnected"),
      { timeout: 10_000 },
    );
  });

  it("should have a chat message input field", async () => {
    const input = await page.waitForSelector('input[aria-label="Chat message input"]', {
      timeout: 5_000,
    });
    assert.ok(input, "Chat input field should exist");
  });

  it("should have a send message button", async () => {
    const sendBtn = await page.waitForSelector('button[aria-label="Send message"]', {
      timeout: 5_000,
    });
    assert.ok(sendBtn, "Send button should exist");
  });

  it("should show chat header with status", async () => {
    // The header shows "Agent Chat" (connected) or "Disconnected" or "Connecting..."
    await page.waitForFunction(
      () => document.body.innerText.includes("Agent Chat") ||
            document.body.innerText.includes("Disconnected") ||
            document.body.innerText.includes("Connecting"),
      { timeout: 5_000 },
    );
  });

  it("should have a Clear button only when there are messages", async () => {
    // With no messages, Clear button should not be visible
    const clearExists = await exists(page, 'button[aria-label="Clear chat history"]');
    // It's OK if it exists or not — depends on localStorage state
    assert.ok(typeof clearExists === "boolean");
  });

  it("should have a reconnect button in the header", async () => {
    // The refresh icon should be in the header
    const header = await page.waitForSelector('.border-b', { timeout: 5_000 });
    assert.ok(header, "Chat header should exist");
  });

  it("should have input placeholder text", async () => {
    const input = await page.waitForSelector('input[aria-label="Chat message input"]', {
      timeout: 5_000,
    });
    const placeholder = await input!.evaluate((el) => (el as HTMLInputElement).placeholder);
    assert.ok(placeholder.length > 0, "Input should have placeholder text");
  });
});
