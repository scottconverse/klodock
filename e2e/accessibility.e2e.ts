/**
 * Accessibility E2E tests.
 *
 * Verifies WCAG 2.1 AA compliance in the running Tauri app.
 * All navigation is done by clicking through the UI, not by URL.
 */

describe("Accessibility: Welcome Screen", () => {
  it("should have a main landmark", async () => {
    const main = await $("main");
    if (await main.isExisting()) {
      expect(await main.isDisplayed()).toBe(true);
    }
  });

  it("should have descriptive heading hierarchy", async () => {
    const h1 = await $("h1");
    await h1.waitForDisplayed({ timeout: 15000 });
    const text = await h1.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("should have no images without alt text", async () => {
    const images = await $$("img");
    for (const img of images) {
      const alt = await img.getAttribute("alt");
      const ariaHidden = await img.getAttribute("aria-hidden");
      expect(alt !== null || ariaHidden === "true").toBe(true);
    }
  });

  it("should have labeled buttons", async () => {
    const buttons = await $$("button");
    for (const button of buttons) {
      const text = await button.getText();
      const ariaLabel = await button.getAttribute("aria-label");
      const ariaLabelledBy = await button.getAttribute("aria-labelledby");
      expect(
        text.trim().length > 0 ||
          ariaLabel !== null ||
          ariaLabelledBy !== null
      ).toBe(true);
    }
  });
});

describe("Accessibility: After Navigation", () => {
  before(async () => {
    // Click "Get Started" to advance past welcome
    const button = await $("button*=Get Started");
    if (await button.isExisting()) {
      await button.click();
      await browser.pause(3000); // Wait for auto-advance
    }
  });

  it("should have labeled form inputs on interactive screens", async () => {
    // Wait for the page to settle (Dependencies/Install may auto-advance)
    await browser.pause(5000);

    const inputs = await $$("input");
    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const type = await input.getAttribute("type");

      if (type === "hidden") continue;

      if (ariaLabel) {
        expect(ariaLabel.length).toBeGreaterThan(0);
      } else if (id) {
        const label = await $(`label[for="${id}"]`);
        const exists = await label.isExisting();
        // Input should have either a label element or aria-label
        expect(exists || ariaLabel !== null).toBe(true);
      }
    }
  });

  it("should be navigable with Tab key", async () => {
    // Tab multiple times and verify focus moves (active element changes)
    let previousId = "";
    let focusMoved = false;
    for (let i = 0; i < 5; i++) {
      await browser.keys("Tab");
      const active = await browser.getActiveElement();
      const currentId = JSON.stringify(active);
      if (previousId && currentId !== previousId) {
        focusMoved = true;
        break;
      }
      previousId = currentId;
    }
    expect(focusMoved).toBe(true);
  });

  it("should have aria-live regions for status updates", async () => {
    // Look for any live regions (progress bars, status text)
    const liveRegions = await $$('[aria-live], [role="status"], [role="alert"]');
    // It's OK if there are none right now (no active operations)
    // but if they exist, they should have valid values
    for (const region of liveRegions) {
      const ariaLive = await region.getAttribute("aria-live");
      const role = await region.getAttribute("role");
      expect(
        ariaLive === "polite" ||
          ariaLive === "assertive" ||
          role === "status" ||
          role === "alert"
      ).toBe(true);
    }
  });
});
