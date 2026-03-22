#!/bin/bash
# KloDock v1.1 — Full Clean Install E2E Test
# Runs completely automated: wipe, install, configure, verify

set -e

NODE_DIR="/c/Users/scott/.klodock/node"
OPENCLAW_DIR="/c/Users/scott/.openclaw"
KLODOCK_DIR="/c/Users/scott/.klodock"
PS="/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

PASS=0
FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   KloDock v1.1 — Full Clean Install E2E Test        ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── PHASE 1: WIPE ──────────────────────────────────────
echo ""
echo "━━━ PHASE 1: TOTAL WIPE ━━━"

"$PS" -Command "Stop-Process -Name klodock -Force -ErrorAction SilentlyContinue; Stop-Process -Name node -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
sleep 2

rm -rf "$KLODOCK_DIR" "$OPENCLAW_DIR" 2>/dev/null || true
"$PS" -Command "Remove-Item -Force 'C:\Users\scott\AppData\Roaming\npm\openclaw*' -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force 'C:\Users\scott\AppData\Roaming\npm\node_modules\openclaw' -ErrorAction SilentlyContinue" 2>/dev/null || true

if test -d "$KLODOCK_DIR" || test -d "$OPENCLAW_DIR" || test -f "/c/Users/scott/AppData/Roaming/npm/openclaw.cmd"; then
  fail "Wipe incomplete"
  exit 1
fi
ok "Machine is clean"

# ── PHASE 2: INSTALL NODE ──────────────────────────────
echo ""
echo "━━━ PHASE 2: INSTALL NODE.JS ━━━"

mkdir -p "$NODE_DIR"
NODE_URL="https://nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip"
TEMP_ZIP="$KLODOCK_DIR/node-download.zip"

echo "  Downloading Node.js v24.14.0..."
curl -sL "$NODE_URL" -o "$TEMP_ZIP"

if ! test -f "$TEMP_ZIP"; then
  fail "Node.js download failed"
  exit 1
fi

echo "  Extracting..."
WIN_KLODOCK="C:\\Users\\scott\\.klodock"
"$PS" -Command "Expand-Archive -Path '${WIN_KLODOCK}\\node-download.zip' -DestinationPath '${WIN_KLODOCK}\\node-tmp' -Force; Get-ChildItem '${WIN_KLODOCK}\\node-tmp\\node-v24.14.0-win-x64\\*' | Move-Item -Destination '${WIN_KLODOCK}\\node' -Force; Remove-Item -Recurse -Force '${WIN_KLODOCK}\\node-tmp'; Remove-Item -Force '${WIN_KLODOCK}\\node-download.zip'"

if test -f "$NODE_DIR/node.exe"; then
  NODE_VER=$("$NODE_DIR/node.exe" --version 2>&1)
  ok "Node.js installed: $NODE_VER"
else
  fail "Node.js not found after extraction"
  exit 1
fi

# ── PHASE 3: INSTALL OPENCLAW ──────────────────────────
echo ""
echo "━━━ PHASE 3: INSTALL OPENCLAW ━━━"

export PATH="$NODE_DIR:$PATH"

# Verify clean state
if test -f "$NODE_DIR/openclaw.cmd"; then
  fail "openclaw.cmd already exists (not clean)"
  exit 1
fi
ok "No pre-existing openclaw (clean state confirmed)"

echo "  Installing OpenClaw via npm (this takes ~30s)..."
"$NODE_DIR/npm.cmd" install -g openclaw@latest --prefix "$NODE_DIR" 2>&1 | tail -3

if test -f "$NODE_DIR/openclaw.cmd"; then
  OC_RAW=$("$NODE_DIR/openclaw.cmd" --version 2>&1)
  ok "OpenClaw installed: $OC_RAW"
else
  fail "openclaw.cmd not found after npm install"
  exit 1
fi

# ── PHASE 4: WRITE CONFIG ──────────────────────────────
echo ""
echo "━━━ PHASE 4: WRITE CONFIG + SOUL.MD ━━━"

mkdir -p "$OPENCLAW_DIR/workspace"

printf '{"agents":{"defaults":{"model":{"primary":"ollama/qwen2.5:7b"},"workspace":"~/.openclaw/workspace"}},"gateway":{"mode":"local","port":18789,"auth":{"mode":"password","password":"e2e-test"}}}\n' > "$OPENCLAW_DIR/openclaw.json"

if test -f "$OPENCLAW_DIR/openclaw.json"; then
  ok "openclaw.json written"
else
  fail "openclaw.json write failed"
fi

printf '# Identity\n\nName: Atlas\n\n# Role\n\nYou are a helpful assistant.\n\n# Tone\n\nTone: balanced (0.5)\n' > "$OPENCLAW_DIR/workspace/SOUL.md"

if test -f "$OPENCLAW_DIR/workspace/SOUL.md"; then
  ok "SOUL.md written"
else
  fail "SOUL.md write failed"
fi

# ── PHASE 5: TEST SKILLS QUERY ─────────────────────────
echo ""
echo "━━━ PHASE 5: SKILLS QUERY ━━━"

# First run after install can be very slow (Node loads 500+ modules cold)
echo "  Querying skills (first cold run — may take 60-90s)..."
SKILLS_OUT=$(timeout 90 "$NODE_DIR/openclaw.cmd" skills list --json 2>&1) || true

if echo "$SKILLS_OUT" | grep -q '"skills"'; then
  SKILL_COUNT=$(echo "$SKILLS_OUT" | "$NODE_DIR/node.exe" -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.skills.length)" 2>/dev/null)
  ELIGIBLE=$(echo "$SKILLS_OUT" | "$NODE_DIR/node.exe" -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.skills.filter(s=>s.eligible).length)" 2>/dev/null)
  ok "Skills: $SKILL_COUNT total, $ELIGIBLE eligible"
else
  fail "Skills query failed or timed out"
fi

# ── PHASE 6: TEST DAEMON START ─────────────────────────
echo ""
echo "━━━ PHASE 6: DAEMON START ━━━"

# Check Ollama
OLLAMA_CHECK=$(curl -s http://localhost:11434/api/tags 2>&1) || true
if echo "$OLLAMA_CHECK" | grep -q '"models"'; then
  ok "Ollama is running"
else
  echo "  ⚠ Ollama not detected (daemon may not serve queries)"
fi

echo "  Starting daemon..."
"$NODE_DIR/openclaw.cmd" gateway --port 18789 > /dev/null 2>&1 &
DAEMON_PID=$!
echo "  Waiting 15s for daemon to initialize..."
sleep 15

if kill -0 $DAEMON_PID 2>/dev/null; then
  ok "Daemon running (PID $DAEMON_PID)"
else
  fail "Daemon died on start"
fi

# Check WebChat
WEBCHAT=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/ 2>&1) || true
if [ "$WEBCHAT" = "200" ] || [ "$WEBCHAT" = "301" ] || [ "$WEBCHAT" = "302" ] || [ "$WEBCHAT" = "401" ]; then
  ok "WebChat endpoint responding (HTTP $WEBCHAT)"
else
  fail "WebChat not responding (HTTP $WEBCHAT)"
fi

# ── PHASE 7: FULL FILE SYSTEM CHECK ───────────────────
echo ""
echo "━━━ PHASE 7: FILE SYSTEM VERIFICATION ━━━"

test -d "$KLODOCK_DIR" && ok "~/.klodock/ exists" || fail "~/.klodock/ missing"
test -f "$NODE_DIR/node.exe" && ok "node.exe exists" || fail "node.exe missing"
test -f "$NODE_DIR/npm.cmd" && ok "npm.cmd exists" || fail "npm.cmd missing"
test -f "$NODE_DIR/openclaw.cmd" && ok "openclaw.cmd exists" || fail "openclaw.cmd missing"
test -f "$OPENCLAW_DIR/openclaw.json" && ok "openclaw.json exists" || fail "openclaw.json missing"
test -f "$OPENCLAW_DIR/workspace/SOUL.md" && ok "SOUL.md exists" || fail "SOUL.md missing"
grep -q "ollama/qwen2.5" "$OPENCLAW_DIR/openclaw.json" && ok "Config has correct model" || fail "Config model wrong"
grep -q "Atlas" "$OPENCLAW_DIR/workspace/SOUL.md" && ok "SOUL.md has agent name" || fail "SOUL.md name missing"
! test -f "/c/Users/scott/AppData/Roaming/npm/openclaw.cmd" && ok "No stale global npm openclaw" || fail "Stale global npm openclaw exists"

# ── CLEANUP ───────────────────────────────────────────
echo ""
echo "━━━ CLEANUP ━━━"
kill $DAEMON_PID 2>/dev/null || true
echo "  Daemon stopped"

# ── SUMMARY ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                    RESULTS                          ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Passed:   %3d                                      ║\n" $PASS
printf "║  Failed:   %3d                                      ║\n" $FAIL
echo "╚══════════════════════════════════════════════════════╝"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "❌ $FAIL TESTS FAILED"
  exit 1
else
  echo ""
  echo "✅ ALL TESTS PASSED — CLEAN INSTALL VERIFIED"
fi
