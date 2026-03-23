#!/usr/bin/env node
/**
 * KloDock v1.2 End-to-End Stress Test
 *
 * Tests the full system through real filesystem and process checks.
 * Run: node scripts/stress-test.mjs
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync, spawnSync } from 'child_process';

const HOME = homedir();
const KLODOCK = join(HOME, '.klodock');
const OPENCLAW = join(HOME, '.openclaw');
const NODE_DIR = join(KLODOCK, 'node');

let passed = 0, failed = 0, warnings = 0, skipped = 0;

function pass(msg) { console.log(`  ✓ PASS  ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗ FAIL  ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠ WARN  ${msg}`); warnings++; }
function skip(msg) { console.log(`  ○ SKIP  ${msg}`); skipped++; }

function section(title) { console.log(`\n━━━ ${title} ━━━\n`); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000, windowsHide: true, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║     KloDock v1.2 — Full End-to-End Stress Test      ║');
console.log('╚══════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════
// SECTION 1: FILE SYSTEM INTEGRITY
// ═══════════════════════════════════════════════════════
section('1. File System Integrity');

// 1.1 KloDock directory exists
if (existsSync(KLODOCK)) pass('~/.klodock/ exists');
else fail('~/.klodock/ missing');

// 1.2 Node.js directory
if (existsSync(NODE_DIR)) pass('~/.klodock/node/ exists');
else fail('~/.klodock/node/ missing');

// 1.3 Managed Node.js works
const nodeExe = join(NODE_DIR, 'node.exe');
if (existsSync(nodeExe)) {
  const ver = run(`"${nodeExe}" --version`);
  if (ver && ver.startsWith('v')) pass(`Managed Node.js: ${ver}`);
  else fail(`Managed Node.js broken: ${ver}`);
} else skip('Managed node.exe not found (may be Unix)');

// 1.4 OpenClaw binary exists
const openclawCmd = join(NODE_DIR, 'openclaw.cmd');
if (existsSync(openclawCmd)) pass('openclaw.cmd exists');
else fail('openclaw.cmd missing');

// 1.5 OpenClaw version check
const ocVer = run(`"${openclawCmd}" --version`, { env: { ...process.env, PATH: `${NODE_DIR};${process.env.PATH}` } });
if (ocVer) pass(`OpenClaw version: ${ocVer}`);
else fail('OpenClaw --version failed');

// 1.6 openclaw.json exists and is valid JSON
const configPath = join(OPENCLAW, 'openclaw.json');
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    pass(`openclaw.json valid (model: ${config?.agents?.defaults?.model?.primary ?? 'unknown'})`);
  } catch {
    fail('openclaw.json exists but invalid JSON');
  }
} else fail('openclaw.json missing');

// 1.7 SOUL.md exists
const soulPath = join(OPENCLAW, 'workspace', 'SOUL.md');
if (existsSync(soulPath)) {
  const soul = readFileSync(soulPath, 'utf8');
  if (soul.length > 10) pass(`SOUL.md exists (${soul.length} bytes)`);
  else warn('SOUL.md exists but very short');
} else fail('SOUL.md missing');

// 1.8 setup-state.json exists
const statePath = join(KLODOCK, 'setup-state.json');
if (existsSync(statePath)) {
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const completed = Object.values(state.steps || {}).filter(s => s === 'completed').length;
    pass(`setup-state.json valid (${completed} steps completed)`);
  } catch {
    fail('setup-state.json invalid');
  }
} else warn('setup-state.json missing (may not have run wizard)');

// ═══════════════════════════════════════════════════════
// SECTION 2: SECRETS / KEYCHAIN
// ═══════════════════════════════════════════════════════
section('2. Secrets / Keychain');

// 2.1 Secrets directory exists (Windows DPAPI)
const secretsDir = join(KLODOCK, 'secrets');
if (existsSync(secretsDir)) {
  const files = readdirSync(secretsDir).filter(f => f.endsWith('.enc'));
  pass(`Secrets dir exists (${files.length} encrypted files)`);

  // 2.2 Filenames are hashed (not readable key names)
  const hasReadableNames = files.some(f => f.includes('OPENAI') || f.includes('ANTHROPIC') || f.includes('API_KEY'));
  if (hasReadableNames) fail('Secret filenames reveal key names — should be hashed');
  else pass('Secret filenames are hashed (no readable key names)');
} else skip('Secrets dir missing (may use Keychain/libsecret)');

// 2.3 No plaintext .env exists when daemon is stopped
const envPath = join(OPENCLAW, '.env');
if (existsSync(envPath)) {
  fail('.env file exists while daemon is stopped — should have been scrubbed');
} else {
  pass('No stale .env file (correctly scrubbed)');
}

// ═══════════════════════════════════════════════════════
// SECTION 3: OPENCLAW SKILLS
// ═══════════════════════════════════════════════════════
section('3. OpenClaw Skills');

const skillsJson = run(`"${openclawCmd}" skills list --json`, {
  env: { ...process.env, PATH: `${NODE_DIR};${process.env.PATH}` },
  timeout: 20000,
});

if (skillsJson) {
  try {
    const data = JSON.parse(skillsJson);
    const total = data.skills?.length ?? 0;
    const eligible = data.skills?.filter(s => s.eligible)?.length ?? 0;
    pass(`Skills list returned ${total} skills (${eligible} eligible)`);

    // 3.1 Check for expected skill structure
    const first = data.skills?.[0];
    if (first && 'name' in first && 'description' in first && 'eligible' in first) {
      pass('Skill objects have expected fields (name, description, eligible)');
    } else {
      fail('Skill objects missing expected fields');
    }

    // 3.2 Check known skills exist
    const slugs = data.skills.map(s => s.name);
    for (const expected of ['weather', 'healthcheck', 'skill-creator', 'node-connect']) {
      if (slugs.includes(expected)) pass(`Known skill "${expected}" found`);
      else fail(`Known skill "${expected}" missing`);
    }
  } catch {
    fail('Skills list returned invalid JSON');
  }
} else {
  fail('openclaw skills list --json failed or timed out');
}

// ═══════════════════════════════════════════════════════
// SECTION 4: .ENV INJECTION DEFENSE
// ═══════════════════════════════════════════════════════
section('4. .env Injection Defense');

// Simulate the sanitization logic
function buildEnv(entries) {
  return Object.entries(entries)
    .map(([k, v]) => `${k.replace(/[\n\r]/g, '')}=${v.replace(/[\n\r]/g, '')}`)
    .join('\n');
}

// 4.1 Newline injection (actual newline character in value)
// The defense strips \n so the injected line becomes part of the value, not a new key=value pair
const injected = buildEnv({ KEY1: `real${String.fromCharCode(10)}INJECTED=evil` });
if (injected.split('\n').length === 1) {
  pass('Newline injection blocked (single line output, no second key=value)');
} else fail('Newline injection NOT blocked — multiple lines produced');

// 4.2 Carriage return injection
const crInjected = buildEnv({ KEY1: `real${String.fromCharCode(13)}${String.fromCharCode(10)}INJECTED=evil` });
if (crInjected.split('\n').length === 1) pass('CR+LF injection blocked');
else fail('CR+LF injection NOT blocked');

// 4.3 100 entries
const big = {};
for (let i = 0; i < 100; i++) big[`KEY_${i}`] = `value_${i}`;
const bigEnv = buildEnv(big);
if (bigEnv.split('\n').length === 100) pass('100 .env entries handled');
else fail(`Expected 100 lines, got ${bigEnv.split('\n').length}`);

// ═══════════════════════════════════════════════════════
// SECTION 5: SOUL.MD GENERATION
// ═══════════════════════════════════════════════════════
section('5. SOUL.md Content Integrity');

if (existsSync(soulPath)) {
  const soul = readFileSync(soulPath, 'utf8');

  // 5.1 Has Identity section
  if (soul.includes('Identity') || soul.includes('identity')) pass('SOUL.md has Identity section');
  else warn('SOUL.md missing Identity section');

  // 5.2 Has name
  if (soul.includes('Name:') || soul.includes('name:')) pass('SOUL.md has agent name');
  else warn('SOUL.md missing agent name');

  // 5.3 Has Role or similar
  if (soul.includes('Role') || soul.includes('role') || soul.includes('assistant')) pass('SOUL.md has role definition');
  else warn('SOUL.md missing role');

  // 5.4 Has Tone
  if (soul.includes('Tone') || soul.includes('tone') || soul.includes('balanced')) pass('SOUL.md has tone setting');
  else warn('SOUL.md missing tone');

  // 5.5 Valid markdown (no broken headers)
  const lines = soul.split('\n');
  const brokenHeaders = lines.filter(l => l.match(/^#{1,6}[^ #]/));
  if (brokenHeaders.length === 0) pass('SOUL.md has valid markdown headers');
  else warn(`SOUL.md has ${brokenHeaders.length} potentially malformed headers`);
} else skip('SOUL.md not found');

// ═══════════════════════════════════════════════════════
// SECTION 6: VERSION CONSISTENCY
// ═══════════════════════════════════════════════════════
section('6. Version Consistency');

const projRoot = join(import.meta.dirname, '..');
const pkgJson = JSON.parse(readFileSync(join(projRoot, 'package.json'), 'utf8'));
const tauriConf = JSON.parse(readFileSync(join(projRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargoToml = readFileSync(join(projRoot, 'src-tauri', 'Cargo.toml'), 'utf8');
const cargoVer = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (pkgJson.version === tauriConf.version && tauriConf.version === cargoVer) {
  pass(`All version files match: ${pkgJson.version}`);
} else {
  fail(`Version mismatch: package.json=${pkgJson.version}, tauri.conf.json=${tauriConf.version}, Cargo.toml=${cargoVer}`);
}

// 6.2 Version is 1.2.0
if (pkgJson.version === '1.2.0') pass('Version is 1.2.0');
else fail(`Expected 1.2.0, got ${pkgJson.version}`);

// 6.3 package.json metadata
if (pkgJson.author) pass(`Author: ${pkgJson.author}`);
else fail('Author missing');
if (pkgJson.license === 'MIT') pass('License: MIT');
else fail(`License: ${pkgJson.license} (expected MIT)`);
if (pkgJson.description) pass(`Description populated`);
else fail('Description empty');

// ═══════════════════════════════════════════════════════
// SECTION 7: FRONTEND BUILD
// ═══════════════════════════════════════════════════════
section('7. Frontend Build & Tests');

// 7.1 Vite build
const buildOutput = run('npx vite build', { cwd: projRoot, timeout: 60000 });
if (buildOutput && buildOutput.includes('built in')) {
  pass('Vite build succeeds');
} else {
  fail('Vite build failed');
}

// 7.2 dist/index.html exists
if (existsSync(join(projRoot, 'dist', 'index.html'))) pass('dist/index.html generated');
else fail('dist/index.html missing');

// 7.3 Vitest
const testOutput = run('npx vitest run', { cwd: projRoot, timeout: 60000 });
if (testOutput && testOutput.includes('passed')) {
  const match = testOutput.match(/(\d+) passed/);
  pass(`Vitest: ${match?.[1] ?? '?'} tests passed`);
} else {
  fail('Vitest failed');
}

// ═══════════════════════════════════════════════════════
// SECTION 8: LANDING PAGE & DOCS
// ═══════════════════════════════════════════════════════
section('8. Docs & Landing Page');

// 8.1 README.md references v1.2
const readme = readFileSync(join(projRoot, 'README.md'), 'utf8');
if (readme.includes('1.2.0') || readme.includes('v1.2')) pass('README.md references v1.2');
else fail('README.md missing v1.2 reference');

// 8.2 Landing page references v1.2
const landing = readFileSync(join(projRoot, 'website', 'index.html'), 'utf8');
if (landing.includes('v1.2') || landing.includes('1.2.0')) pass('Landing page references v1.2');
else fail('Landing page missing v1.2');

// 8.3 Landing page has screenshots
if (landing.includes('dashboard-overview.png')) pass('Landing page has screenshot references');
else fail('Landing page missing screenshots');

// 8.4 PDF exists and is non-trivial
const pdfPath = join(projRoot, 'KloDock-README.pdf');
if (existsSync(pdfPath)) {
  const stat = readFileSync(pdfPath);
  if (stat.length > 100000) pass(`PDF exists (${(stat.length / 1024).toFixed(0)} KB)`);
  else warn(`PDF exists but small (${stat.length} bytes)`);
} else fail('KloDock-README.pdf missing');

// 8.5 Screenshots exist
const screenshotDir = join(projRoot, 'screenshots');
const expectedScreenshots = ['dashboard-overview', 'dashboard-skills', 'dashboard-personality', 'dashboard-channels', 'dashboard-settings', 'dashboard-updates'];
for (const name of expectedScreenshots) {
  if (existsSync(join(screenshotDir, `${name}.png`))) pass(`Screenshot: ${name}.png`);
  else fail(`Screenshot missing: ${name}.png`);
}

// ═══════════════════════════════════════════════════════
// SECTION 9: INSTALLER ARTIFACT
// ═══════════════════════════════════════════════════════
section('9. Build Artifacts');

const nsisPath = join(projRoot, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
if (existsSync(nsisPath)) {
  const installers = readdirSync(nsisPath).filter(f => f.endsWith('.exe'));
  if (installers.length > 0) {
    const latest = installers[installers.length - 1];
    pass(`NSIS installer: ${latest}`);
    if (latest.includes('1.2.0')) pass('Installer filename includes v1.2.0');
    else fail(`Installer filename doesn't include 1.2.0: ${latest}`);
  } else fail('No .exe installer in bundle/nsis/');
} else skip('NSIS bundle dir not found');

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║                    RESULTS                          ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Passed:   ${String(passed).padStart(3)}                                      ║`);
console.log(`║  Failed:   ${String(failed).padStart(3)}                                      ║`);
console.log(`║  Warnings: ${String(warnings).padStart(3)}                                      ║`);
console.log(`║  Skipped:  ${String(skipped).padStart(3)}                                      ║`);
console.log(`║  Total:    ${String(passed + failed + warnings + skipped).padStart(3)}                                      ║`);
console.log('╚══════════════════════════════════════════════════════╝');

if (failed > 0) {
  console.log(`\n❌ ${failed} TESTS FAILED`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n⚠️  ALL PASSED but ${warnings} warnings to review`);
} else {
  console.log('\n✅ ALL TESTS PASSED — CLEAN');
}
