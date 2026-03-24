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

  it("should show disconnected state since WebSocket is not real", async () => {
    // In the browser without a real WebSocket server, chat will be disconnected.
    // Wait for the connection attempt to fail.
    await page.waitForFunction(
      () => document.body.innerText.includes("Disconnected") ||
            document.body.innerText.includes("Start Agent") ||
            document.body.innerText.includes("Connecting"),
      { timeout: 10_000 },
    );
  });

  it("should show Start Agent button when disconnected", async () => {
    // After connection fails, the Start Agent button should appear
    const startBtn = await page.waitForSelector('button[aria-label="Start your agent"]', {
      timeout: 15_000,
    });
    assert.ok(startBtn, "Start Agent button should be visible when disconnected");
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

  it("should disable input when not connected", async () => {
    const input = await page.waitForSelector('input[aria-label="Chat message input"]', {
      timeout: 5_000,
    });
    const disabled = await input!.evaluate((el) => (el as HTMLInputElement).disabled);
    assert.ok(disabled, "Input should be disabled when not connected");
  });

  it("should disable send button when not connected", async () => {
    const sendBtn = await page.waitForSelector('button[aria-label="Send message"]', {
      timeout: 5_000,
    });
    const disabled = await sendBtn!.evaluate((el) => (el as HTMLButtonElement).disabled);
    assert.ok(disabled, "Send button should be disabled when not connected");
  });

  it("should display helpful text when disconnected with no messages", async () => {
    await waitForText(page, "agent isn't running");
  });
});
