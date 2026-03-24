import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText, exists,
} from "../setup.js";

describe("Settings Page", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
    await navigateTo(page, "/dashboard/settings");
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  it("should display Settings heading", async () => {
    await waitForText(page, "Settings");
    const heading = await page.$eval("h2", (el) => el.textContent?.trim());
    assert.equal(heading, "Settings");
  });

  it("should display Active Model section", async () => {
    await waitForText(page, "Active Model");
  });

  it("should show the current model reference", async () => {
    // The mock config returns "anthropic/claude-sonnet-4-6"
    await waitForText(page, "anthropic/claude-sonnet-4-6");
  });

  it("should display AI Providers section heading", async () => {
    await waitForText(page, "AI Providers");
  });

  it("should display provider cards for all providers", async () => {
    const providerNames = [
      "OpenAI", "Anthropic", "Google Gemini", "Groq", "OpenRouter", "Ollama (Local)",
    ];
    for (const name of providerNames) {
      await waitForText(page, name);
    }
  });

  it("should show Anthropic as connected (key is stored)", async () => {
    // The mock returns ["ANTHROPIC_API_KEY"] from list_secrets
    await waitForText(page, "Key stored securely");
  });

  it("should display tier picker buttons (Fast/Smart/Pro) for connected provider", async () => {
    // The connected Anthropic provider should show tier picker
    const tierLabels = ["Fast", "Smart", "Pro"];
    for (const label of tierLabels) {
      const found = await page.evaluate((l: string) => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.some((b) => b.textContent?.includes(l));
      }, label);
      assert.ok(found, `Tier button "${label}" should be visible`);
    }
  });

  it("should show Test Connection button for unconnected providers", async () => {
    await waitForText(page, "Test Connection");
  });

  it("should show Get Key button for API providers", async () => {
    const getKeyButtons = await page.$$eval("button", (els) =>
      els.filter((el) => el.textContent?.includes("Get Key")).length,
    );
    assert.ok(getKeyButtons > 0, "Should have Get Key buttons");
  });

  it("should show Set as Primary button for connected non-active providers", async () => {
    // Ollama is detected as connected by the mock (checkOllama returns true
    // with models), and it's not the active provider (anthropic is),
    // so it should show Set as Primary.
    const found = await page.evaluate(() => {
      return document.body.innerText.includes("Set as Primary");
    });
    assert.ok(found, "Set as Primary button should be visible for non-active connected providers");
  });

  it("should show Primary Provider badge for active provider", async () => {
    await waitForText(page, "Primary Provider");
  });

  it("should display Gateway settings section", async () => {
    await waitForText(page, "Gateway");
  });

  it("should have a port input", async () => {
    const portInput = await page.waitForSelector("#gateway-port", { timeout: 5_000 });
    assert.ok(portInput, "Port input should exist");
    const value = await portInput!.evaluate((el) => (el as HTMLInputElement).value);
    assert.equal(value, "18789");
  });
});
