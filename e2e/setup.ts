/**
 * E2E test setup: starts Vite dev server, launches Puppeteer,
 * and injects Tauri mocks before each page load.
 */

import { type ChildProcess, spawn } from "node:child_process";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { buildTauriMockScript } from "./mocks/tauri.js";

const VITE_PORT = 1420;
const BASE_URL = `http://localhost:${VITE_PORT}`;
const TAURI_MOCK_SCRIPT = buildTauriMockScript();

let viteProcess: ChildProcess | null = null;
let browser: Browser | null = null;

/* ── Vite dev server ──────────────────────────────────── */

export async function startVite(): Promise<void> {
  // Check if Vite is already running on the port
  const isRunning = await fetch(BASE_URL).then(() => true).catch(() => false);
  if (isRunning) {
    console.log(`[e2e] Vite already running on port ${VITE_PORT}`);
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const proc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
      cwd: process.cwd(),
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    viteProcess = proc;
    let started = false;

    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error("Vite did not start within 30 seconds"));
      }
    }, 30_000);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (!started && text.includes("Local:")) {
        started = true;
        clearTimeout(timeout);
        // Give Vite a moment to fully initialize
        setTimeout(resolve, 1000);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      // Vite sometimes writes to stderr for warnings — ignore them
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Vite exited with code ${code}`));
      }
    });
  });
}

export function stopVite(): void {
  if (viteProcess) {
    viteProcess.kill("SIGTERM");
    viteProcess = null;
  }
}

/* ── Puppeteer browser ────────────────────────────────── */

export async function launchBrowser(): Promise<Browser> {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/* ── Page helpers ─────────────────────────────────────── */

/**
 * Create a new page with Tauri mocks injected.
 * The mock script runs before any application JS via `evaluateOnNewDocument`.
 */
export async function newPage(): Promise<Page> {
  const b = await launchBrowser();
  const page = await b.newPage();

  // Inject mocks before any script runs on every navigation
  await page.evaluateOnNewDocument(TAURI_MOCK_SCRIPT);

  // Set a reasonable viewport
  await page.setViewport({ width: 1280, height: 800 });

  return page;
}

/**
 * Navigate to a dashboard route and wait for it to render.
 * Assumes `page` was created via `newPage()` (mocks already injected).
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  const url = `${BASE_URL}${path}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 15_000 });

  // The app redirects / → /dashboard when setup is complete.
  // Wait for the dashboard sidebar to appear.
  await page.waitForSelector("nav", { timeout: 10_000 });
}

/**
 * Navigate to a specific dashboard sub-page by its sidebar link text.
 */
export async function navigateViasidebar(page: Page, label: string): Promise<void> {
  // Click the sidebar link matching the label
  const link = await page.waitForSelector(`nav a`, { timeout: 5_000 });
  const links = await page.$$("nav a");
  for (const l of links) {
    const text = await l.evaluate((el) => el.textContent?.trim());
    if (text === label) {
      await l.click();
      // Wait for navigation to settle
      await page.waitForNetworkIdle({ timeout: 5_000 });
      return;
    }
  }
  throw new Error(`Sidebar link "${label}" not found`);
}

/**
 * Get text content of an element matching a selector.
 */
export async function getText(page: Page, selector: string): Promise<string> {
  const el = await page.waitForSelector(selector, { timeout: 5_000 });
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el.evaluate((node) => node.textContent?.trim() ?? "");
}

/**
 * Check whether an element matching a selector exists on the page.
 */
export async function exists(page: Page, selector: string, timeout = 3_000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for text to appear somewhere on the page.
 */
export async function waitForText(page: Page, text: string, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (t: string) => document.body.innerText.includes(t),
    { timeout },
    text,
  );
}

export { BASE_URL, VITE_PORT };
