import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type Page } from "puppeteer";
import {
  startVite, stopVite, launchBrowser, closeBrowser,
  newPage, navigateTo,
} from "../setup.js";

describe("Accessibility (WCAG)", () => {
  let page: Page;

  before(async () => {
    await startVite();
    await launchBrowser();
    page = await newPage();
  });

  after(async () => {
    await page.close();
    await closeBrowser();
    stopVite();
  });

  describe("Overview page accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard");
    });

    it("should have aria-label on all buttons", async () => {
      // Wait for content to load
      await page.waitForSelector("h2", { timeout: 10_000 });

      const unlabelledButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.filter((b) => {
          const label = b.getAttribute("aria-label");
          const text = b.textContent?.trim();
          const labelledBy = b.getAttribute("aria-labelledby");
          // A button is accessible if it has aria-label, aria-labelledby, or visible text
          return !label && !labelledBy && !text;
        }).length;
      });
      assert.equal(unlabelledButtons, 0, "All buttons should have accessible labels");
    });

    it("should have role=status on status indicators", async () => {
      const statusElements = await page.$$('[role="status"]');
      assert.ok(statusElements.length > 0, "Should have elements with role=status");
    });

    it("should have aria-label on status indicators", async () => {
      const hasAriaLabel = await page.evaluate(() => {
        const statusEls = document.querySelectorAll('[role="status"]');
        return Array.from(statusEls).every(
          (el) => el.getAttribute("aria-label") !== null,
        );
      });
      assert.ok(hasAriaLabel, "All status elements should have aria-label");
    });

    it("should have aria-hidden on decorative icons", async () => {
      const decorativeIcons = await page.evaluate(() => {
        // Lucide icons are rendered as SVGs with aria-hidden
        const svgs = document.querySelectorAll("svg");
        let hiddenCount = 0;
        let totalInButtons = 0;
        for (const svg of svgs) {
          // SVGs inside buttons that also have text are decorative
          const parent = svg.closest("button, a, span, div");
          if (parent && svg.getAttribute("aria-hidden") === "true") {
            hiddenCount++;
          }
          totalInButtons++;
        }
        return { hiddenCount, totalInButtons };
      });
      // Most icons should be aria-hidden
      assert.ok(
        decorativeIcons.hiddenCount > 0,
        "Decorative icons should have aria-hidden=true",
      );
    });
  });

  describe("Navigation accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard");
    });

    it("should have nav element with aria-label", async () => {
      const navLabel = await page.$eval("nav", (el) => el.getAttribute("aria-label"));
      assert.ok(navLabel, "Nav should have aria-label");
      assert.equal(navLabel, "Dashboard");
    });

    it("should have focus-visible styles on nav links", async () => {
      const hasFocusStyles = await page.evaluate(() => {
        const links = document.querySelectorAll("nav a");
        return Array.from(links).every((link) =>
          link.className.includes("focus-visible:outline"),
        );
      });
      assert.ok(hasFocusStyles, "Nav links should have focus-visible styles");
    });
  });

  describe("Chat page accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard/chat");
    });

    it("should have aria-label on chat container", async () => {
      const chatLabel = await page.$eval('[role="log"]', (el) =>
        el.getAttribute("aria-label"),
      );
      assert.ok(chatLabel, "Chat container should have aria-label");
    });

    it("should have aria-label on chat input", async () => {
      const inputLabel = await page.$eval(
        'input[type="text"]',
        (el) => el.getAttribute("aria-label"),
      );
      assert.ok(inputLabel, "Chat input should have aria-label");
    });

    it("should have aria-label on send button", async () => {
      const sendLabel = await page.$eval(
        'button[aria-label="Send message"]',
        (el) => el.getAttribute("aria-label"),
      );
      assert.equal(sendLabel, "Send message");
    });
  });

  describe("Skills page accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard/skills");
    });

    it("should have aria-label on search input", async () => {
      const searchLabel = await page.$eval(
        'input[aria-label="Search skills"]',
        (el) => el.getAttribute("aria-label"),
      );
      assert.equal(searchLabel, "Search skills");
    });

    it("should have focus ring styles on interactive elements", async () => {
      const hasFocusRing = await page.evaluate(() => {
        const buttons = document.querySelectorAll("button");
        let count = 0;
        for (const btn of buttons) {
          if (
            btn.className.includes("focus:ring") ||
            btn.className.includes("focus-visible:outline")
          ) {
            count++;
          }
        }
        return count;
      });
      assert.ok(hasFocusRing > 0, "Buttons should have focus ring styles");
    });
  });

  describe("Channels page accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard/channels");
    });

    it("should have aria-expanded on expandable channel sections", async () => {
      const expandableButtons = await page.$$eval(
        "button[aria-expanded]",
        (els) => els.length,
      );
      assert.ok(expandableButtons >= 2, "Should have at least 2 expandable channel buttons");
    });

    it("should have aria-label on channel expand buttons", async () => {
      const labels = await page.$$eval(
        "button[aria-expanded]",
        (els) => els.map((el) => el.getAttribute("aria-label")),
      );
      for (const label of labels) {
        assert.ok(label, "Each expandable button should have aria-label");
        assert.ok(
          label!.includes("channel setup"),
          "Label should describe the channel setup",
        );
      }
    });
  });

  describe("Settings page accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard/settings");
    });

    it("should have labels on form inputs", async () => {
      // Check that port input has a label
      const portLabel = await page.$eval(
        'label[for="gateway-port"]',
        (el) => el.textContent?.trim(),
      );
      assert.ok(portLabel, "Port input should have a label");
    });

    it("should have aria-label on provider action buttons", async () => {
      const getKeyLabels = await page.$$eval(
        'button[aria-label*="Get API key"]',
        (els) => els.length,
      );
      assert.ok(getKeyLabels > 0, "Get Key buttons should have descriptive aria-labels");
    });
  });

  describe("No images without alt text", () => {
    it("should not have any img elements without alt attribute", async () => {
      await navigateTo(page, "/dashboard");

      const imgsWithoutAlt = await page.evaluate(() => {
        const imgs = document.querySelectorAll("img");
        return Array.from(imgs).filter(
          (img) => !img.hasAttribute("alt"),
        ).length;
      });
      assert.equal(imgsWithoutAlt, 0, "All img elements should have alt attributes");
    });
  });

  describe("Activity log accessibility", () => {
    before(async () => {
      await navigateTo(page, "/dashboard");
    });

    it("should have role=log on activity feed", async () => {
      const logEl = await page.$('[role="log"]');
      assert.ok(logEl, "Activity feed should have role=log");
    });

    it("should have aria-label on activity log", async () => {
      const label = await page.$eval('[role="log"]', (el) =>
        el.getAttribute("aria-label"),
      );
      assert.ok(label, "Activity log should have aria-label");
    });
  });
});
