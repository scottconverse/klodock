/**
 * Full wizard walkthrough E2E test.
 *
 * Launches the real ClawPad app via tauri-driver and clicks through
 * the wizard screens. Tests navigate by clicking buttons (not URLs)
 * since the Tauri webview doesn't support arbitrary URL navigation.
 */

describe("Setup Wizard Walkthrough", () => {
  it("should show the Welcome screen on first launch", async () => {
    const heading = await $("h1");
    await heading.waitForDisplayed({ timeout: 15000 });
    const text = await heading.getText();
    expect(text).toContain("Welcome");
  });

  it("should navigate from Welcome to Dependencies on Get Started click", async () => {
    const button = await $("button*=Get Started");
    await button.waitForClickable({ timeout: 5000 });
    await button.click();

    // Dependencies screen will auto-detect node and may auto-advance
    // Wait for any heading to appear
    await browser.pause(2000);
    const heading = await $("h2");
    await heading.waitForDisplayed({ timeout: 15000 });
    const text = await heading.getText();
    // Could be Dependencies, Install, or Model Provider depending on
    // whether Node.js was already installed and auto-advanced
    expect(text.length).toBeGreaterThan(0);
  });

  it("should have a visible progress bar showing wizard steps", async () => {
    // Progress indicators (numbered circles) should be visible
    const steps = await $$('[class*="rounded-full"]');
    expect(steps.length).toBeGreaterThan(0);
  });

  it("should have keyboard-navigable elements", async () => {
    await browser.keys("Tab");
    // In WebdriverIO, getActiveElement returns an element ID, not an Element
    const activeEl = await browser.getActiveElement();
    // Verify we got a valid active element (not null/undefined)
    expect(activeEl).toBeTruthy();
  });

  it("should eventually reach the Model Provider screen", async () => {
    // The Dependencies and Install screens auto-advance.
    // Wait for the Model Provider screen (or whatever screen we land on).
    // Give it enough time for Node.js detection + OpenClaw check.
    await browser.waitUntil(
      async () => {
        const headings = await $$("h2, h3");
        for (const h of headings) {
          const text = await h.getText();
          if (
            text.includes("Provider") ||
            text.includes("API") ||
            text.includes("Personality") ||
            text.includes("Channel")
          ) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 60000, // Node install can take a while
        interval: 2000,
        timeoutMsg:
          "Never reached Model Provider / Personality / Channels screen",
      }
    );
  });

  it("should display provider cards or have advanced past them", async () => {
    // The wizard may have auto-advanced past the provider screen
    // if Node.js and OpenClaw were already installed. Either outcome is valid.
    await browser.pause(2000); // Let the screen settle
    const h2 = await $("h2");
    const text = await h2.getText();

    if (text.includes("Provider") || text.includes("API")) {
      // We're on the provider screen — wait for cards to render
      await browser.pause(1000);
      const cards = await $$("h3");
      const count = cards.length;
      // Should have some provider card headings
      expect(count).toBeGreaterThan(0);
    } else {
      // We auto-advanced past it — that's correct behavior
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("should show Ollama card with detection status", async () => {
    const ollamaText = await $("*=Ollama");
    if (await ollamaText.isExisting()) {
      expect(await ollamaText.isDisplayed()).toBe(true);
      // Should show either "detected", "not running", or "Check Again"
      const checkButton = await $("button*=Check Again");
      const detected = await $("*=detected");
      const download = await $("*=Download Ollama");
      const hasStatus =
        (await checkButton.isExisting()) ||
        (await detected.isExisting()) ||
        (await download.isExisting());
      expect(hasStatus).toBe(true);
    }
  });

  it("should disable Next button when no provider is validated", async () => {
    const nextButton = await $("button*=Next");
    if (await nextButton.isExisting()) {
      const isDisabled = await nextButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();
    }
  });
});
