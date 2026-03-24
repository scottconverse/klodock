import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo, waitForText,
} from "../setup.js";

describe("Sidebar Navigation", () => {
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

  const NAV_ITEMS = [
    { label: "Overview", path: "/dashboard" },
    { label: "Chat", path: "/dashboard/chat" },
    { label: "Skills", path: "/dashboard/skills" },
    { label: "Personality", path: "/dashboard/personality" },
    { label: "Channels", path: "/dashboard/channels" },
    { label: "Settings", path: "/dashboard/settings" },
    { label: "Updates", path: "/dashboard/updates" },
  ];

  it("should render all 7 sidebar navigation links", async () => {
    const links = await page.$$("nav a");
    const texts: string[] = [];
    for (const link of links) {
      const text = await link.evaluate((el) => el.textContent?.trim() ?? "");
      texts.push(text);
    }
    for (const item of NAV_ITEMS) {
      assert.ok(texts.includes(item.label), `Sidebar should contain "${item.label}" link`);
    }
  });

  it("should highlight the active navigation item", async () => {
    // On /dashboard, the Overview link should have active styling
    const links = await page.$$("nav a");
    for (const link of links) {
      const text = await link.evaluate((el) => el.textContent?.trim() ?? "");
      if (text === "Overview") {
        const className = await link.evaluate((el) => el.className);
        assert.ok(className.includes("bg-primary-50"), "Overview link should have active class");
      }
    }
  });

  for (const item of NAV_ITEMS) {
    it(`should navigate to ${item.label} (${item.path})`, async () => {
      // Click the sidebar link
      const links = await page.$$("nav a");
      for (const link of links) {
        const text = await link.evaluate((el) => el.textContent?.trim() ?? "");
        if (text === item.label) {
          await link.click();
          break;
        }
      }
      await page.waitForNetworkIdle({ timeout: 5_000 });

      // Verify URL changed
      const url = new URL(page.url());
      assert.equal(url.pathname, item.path, `Should navigate to ${item.path}`);
    });
  }

  it("should display KloDock branding in sidebar", async () => {
    await navigateTo(page, "/dashboard");
    await waitForText(page, "KloDock");
  });

  it('should display "Dashboard" header', async () => {
    const header = await page.waitForSelector("header h1", { timeout: 5_000 });
    const text = await header!.evaluate((el) => el.textContent?.trim());
    assert.equal(text, "Dashboard");
  });

  it("should show status indicator in sidebar", async () => {
    const statusEl = await page.waitForSelector('[role="status"]', { timeout: 5_000 });
    assert.ok(statusEl, "Status indicator should be present");
  });
});
