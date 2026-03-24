import PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = resolve(import.meta.dirname, '..');
const OUT = resolve(BASE, 'KloDock-README.pdf');
const SCREENSHOTS = resolve(BASE, 'screenshots');

const doc = new PDFDocument({
  size: 'letter',
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: {
    Title: 'KloDock v1.3.0 — Desktop GUI for OpenClaw',
    Author: 'Scott Converse',
    Subject: 'Product Documentation',
  },
});

const stream = createWriteStream(OUT);
doc.pipe(stream);

const BLUE = '#2563eb';
const DARK = '#1e293b';
const GRAY = '#64748b';
const LIGHT_GRAY = '#94a3b8';

function heading1(text) {
  if (doc.y > 600) doc.addPage();
  doc.moveDown(1);
  doc.fontSize(22).fillColor(DARK).font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
  doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function heading2(text) {
  if (doc.y > 640) doc.addPage();
  doc.moveDown(0.8);
  doc.fontSize(16).fillColor(BLUE).font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
}

function heading3(text) {
  if (doc.y > 660) doc.addPage();
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor(DARK).font('Helvetica-Bold').text(text);
  doc.moveDown(0.2);
}

function para(text) {
  doc.fontSize(10.5).fillColor(DARK).font('Helvetica').text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

function bullet(text) {
  const x = doc.x;
  doc.fontSize(10.5).fillColor(DARK).font('Helvetica');
  doc.text(`  \u2022  ${text}`, { indent: 0, lineGap: 2 });
  doc.moveDown(0.15);
}

function caption(text) {
  doc.fontSize(9).fillColor(GRAY).font('Helvetica-Oblique').text(text, { align: 'center' });
  doc.moveDown(0.5);
}

function addScreenshot(filename, captionText) {
  const imgPath = resolve(SCREENSHOTS, filename);
  try {
    // Check remaining space on page
    if (doc.y > 450) doc.addPage();
    doc.moveDown(0.5);
    doc.image(imgPath, { fit: [468, 300], align: 'center' });
    doc.moveDown(0.3);
    caption(captionText);
  } catch (e) {
    para(`[Screenshot: ${captionText}]`);
  }
}

function checkPage(needed = 80) {
  if (doc.y > 660) doc.addPage();
}

function tableRow(cols, bold = false) {
  checkPage(30);
  const font = bold ? 'Helvetica-Bold' : 'Helvetica';
  doc.fontSize(9.5).font(font).fillColor(DARK);
  // Use flowing text instead of absolute positioning
  const row = cols.join('  |  ');
  doc.text(row, { lineGap: 2 });
  if (bold) {
    // Underline header
    doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc.moveDown(0.2);
  }
}

// ═══════════════════════════════════════════════════════════
// TITLE PAGE
// ═══════════════════════════════════════════════════════════

doc.moveDown(6);
doc.fontSize(42).fillColor(BLUE).font('Helvetica-Bold').text('KloDock', { align: 'center' });
doc.moveDown(0.3);
doc.fontSize(14).fillColor(GRAY).font('Helvetica').text('Desktop GUI for OpenClaw', { align: 'center' });
doc.moveDown(0.2);
doc.fontSize(11).fillColor(LIGHT_GRAY).text('Zero terminal. Zero complexity.', { align: 'center' });
doc.moveDown(3);

doc.fontSize(11).fillColor(DARK).font('Helvetica');
doc.text('Version 1.3.0', { align: 'center' });
doc.text('March 2026', { align: 'center' });
doc.moveDown(0.5);
doc.text('Scott Converse', { align: 'center' });
doc.text('MIT License', { align: 'center' });

doc.addPage();

// ═══════════════════════════════════════════════════════════
// 1. OVERVIEW
// ═══════════════════════════════════════════════════════════

heading1('1. Overview');

para('KloDock is a native desktop application that wraps the open-source OpenClaw AI agent framework in a visual, point-and-click interface. OpenClaw is one of the most capable open-source agent platforms available, but it demands terminal fluency, manual JSON and Markdown configuration, and comfortable API key management \u2014 skills that put it out of reach for most non-technical users.');

para('KloDock fills that gap. It packages the entire OpenClaw setup and management lifecycle into a guided wizard that takes minutes, not hours, from download to a running agent. There is no command line, no config file editing, and no Markdown to write. The user downloads a lightweight installer, runs the wizard, and talks to their agent.');

para('Everything stays local: keys are stored in the operating system\u2019s native credential store, the agent process runs on the user\u2019s machine, and no data leaves the device except what the user\u2019s chosen AI provider requires.');

// ═══════════════════════════════════════════════════════════
// ARCHITECTURE DIAGRAM
// ═══════════════════════════════════════════════════════════

doc.addPage();
heading1('System Architecture');

para('KloDock is built on four layers: a React frontend rendered in a Tauri webview, a Rust backend that handles all system operations, the OpenClaw agent runtime (Node.js), and external AI providers. All communication between layers uses type-safe Tauri IPC calls \u2014 no HTTP servers, no WebSocket protocols, no origin headers.');

para('The chat interface uses a direct CLI approach: user messages are passed to the OpenClaw agent command as a child process, which calls the AI provider and returns the response. This eliminates the gateway authentication complexity entirely.');

try {
  const archPath = resolve(SCREENSHOTS, 'architecture-portrait.png');
  doc.moveDown(0.3);
  doc.image(archPath, 20, doc.y, { width: 530 });
  // The portrait diagram is tall — add a page break after
  doc.addPage();
} catch (e) {
  para('[Architecture diagram: see docs/architecture.svg]');
}

para('Security is enforced at every layer: API keys are encrypted in the OS keychain (Windows DPAPI, macOS Keychain, Linux libsecret), materialized to a temporary .env file only during agent calls, and scrubbed immediately after. Node.js downloads are SHA-256 verified. A pre-commit git hook prevents accidental key exposure.');

doc.addPage();

// ═══════════════════════════════════════════════════════════
// 2. KEY FEATURES
// ═══════════════════════════════════════════════════════════

heading1('2. Key Features');

bullet('7-step setup wizard \u2014 From download to a running AI agent in minutes, not hours. No terminal, no manual steps.');
bullet('Silent Node.js installation \u2014 Detects existing installs, nvm, Volta, Homebrew. Silently downloads v24.14.0 if needed.');
bullet('Visual personality builder \u2014 Name, role templates, tone slider, live SOUL.md preview.');
bullet('Secure API key management \u2014 OS credential store (DPAPI, Keychain, libsecret). Keys never in plaintext.');
bullet('Ollama integration \u2014 Auto-detection, model listing, model picker. Free, local AI with no API key needed.');
bullet('Channel setup \u2014 Guided Telegram and Discord configuration with token validation.');
bullet('52 categorized skills \u2014 8 categories with search, filtering, and actionable setup buttons.');
bullet('Full management dashboard \u2014 6 pages: Overview, Skills, Personality, Channels, Settings, Updates.');
bullet('Auto-updater \u2014 Checks npm registry for latest OpenClaw, one-click "Update now" button.');
bullet('Toast notification system \u2014 Global success, error, warning, and info feedback.');
bullet('Daemon auto-restart \u2014 Automatic recovery with backoff (up to 3 attempts).');
bullet('Start on login \u2014 Optional system tray launcher (registry/launch agent/XDG).');
bullet('Clean uninstall \u2014 Resumable 7-step process, user data preserved by default.');
bullet('Accessible \u2014 WCAG 2.1 AA, keyboard navigation, screen reader tested.');

addScreenshot('dashboard-overview.png', 'Dashboard Overview \u2014 Health checks, agent status, and quick actions');

// ═══════════════════════════════════════════════════════════
// 3. DASHBOARD
// ═══════════════════════════════════════════════════════════

heading1('3. Dashboard');

para('KloDock\u2019s dashboard provides full management of your AI agent without ever touching a config file. Every setting that can be configured in the setup wizard is also editable from the dashboard.');

heading2('Skills');
para('52 bundled skills organized into 8 categories: Communication, Productivity, Developer Tools, Media & Audio, Smart Home, AI Services, Images & Video, and System & Security. Active skills show a green badge. Unavailable skills show exactly what\u2019s needed with a download link or navigation button. Search and category filters help you find what you need.');

addScreenshot('dashboard-skills.png', 'Skills Browser \u2014 Search, filter by category, and see what each skill needs');

heading2('Personality');
para('View and edit your agent\u2019s identity inline. Change the name, role, tone, and special instructions, then see a live SOUL.md preview before saving.');

addScreenshot('dashboard-personality.png', 'Personality Editor \u2014 Name, role, tone slider, and SOUL.md preview');

heading2('Channels');
para('Connect messaging channels with step-by-step guides. WebChat is always available. Telegram and Discord have expandable setup flows with token validation, save, and disconnect.');

addScreenshot('dashboard-channels.png', 'Channel Setup \u2014 WebChat built-in, Telegram and Discord with guided setup');

heading2('Settings');
para('Full AI provider management with the same card grid from the setup wizard. Switch providers with "Set as Primary," manage API keys, configure the gateway port and auth mode. Includes a Danger Zone with one-click uninstall.');

addScreenshot('dashboard-settings.png', 'AI Provider Settings \u2014 Connect, switch, and manage providers');

heading2('Updates');
para('Real-time version checking against the npm registry. Shows current vs. latest version with a clear "Up to date" or "Update now" button.');

addScreenshot('dashboard-updates.png', 'Update Manager \u2014 Version check with one-click update');

// ═══════════════════════════════════════════════════════════
// 4. SECURITY
// ═══════════════════════════════════════════════════════════

heading1('4. Security Model');

para('KloDock treats API keys as the most sensitive data in the system. Keys are stored in the OS credential store (DPAPI on Windows, Keychain on macOS, libsecret on Linux) and never exist in plaintext at rest.');

bullet('Ephemeral .env \u2014 Written only while the daemon runs, scrubbed on stop and on every launch.');
bullet('Crash recovery scrub \u2014 On every launch, removes any stale .env from a prior crash.');
bullet('SHA256 verification \u2014 Node.js downloads verified against official checksums.');
bullet('Tauri capabilities \u2014 Frontend restricted to registered IPC commands only.');
bullet('Ollama zero-key path \u2014 No API key stored, no .env created, no credentials anywhere.');
bullet('No telemetry \u2014 No usage data collected or transmitted by default.');

// ═══════════════════════════════════════════════════════════
// 5. TECH STACK
// ═══════════════════════════════════════════════════════════

heading1('5. Tech Stack');

tableRow(['Layer', 'Choice'], true);
tableRow(['Desktop framework', 'Tauri v2 (Rust backend, system webview)']);
tableRow(['Frontend', 'React 19 + TypeScript + Tailwind CSS v4']);
tableRow(['Routing', 'React Router v7']);
tableRow(['Icons', 'Lucide React']);
tableRow(['Secret storage', 'DPAPI (Win), Keychain (macOS), libsecret (Linux)']);
tableRow(['Testing', 'Vitest + Cargo test + WebdriverIO E2E']);
tableRow(['CI/CD', 'GitHub Actions (cross-platform)']);

// ═══════════════════════════════════════════════════════════
// 6. COMPETITIVE POSITIONING
// ═══════════════════════════════════════════════════════════

heading1('6. Competitive Positioning');

tableRow(['Product', 'Price / Local / GUI / Terminal'], true);
tableRow(['KloDock', 'Free / Local / Yes / No']);
tableRow(['OpenClaw CLI', 'Free / Local / No / Yes']);
tableRow(['Clawnify', '$20+/mo / Cloud / Yes / No']);
tableRow(['OneClaw', '$10/mo / Cloud / Yes / No']);
tableRow(['KiwiClaw', '$15-39/mo / Cloud / Yes / No']);

doc.moveDown(0.5);
para('KloDock occupies the unique position of being both free and easy to use while keeping all data local.');

// ═══════════════════════════════════════════════════════════
// 7. LICENSE
// ═══════════════════════════════════════════════════════════

heading1('7. License');
para('MIT License \u2014 Copyright (c) 2026 Scott Converse');

// ═══════════════════════════════════════════════════════════
// DONE
// ═══════════════════════════════════════════════════════════

doc.end();

stream.on('finish', () => {
  console.log(`PDF generated: ${OUT}`);
});
