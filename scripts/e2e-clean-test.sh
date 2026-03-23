#!/bin/bash
# Full E2E clean machine test — wipes everything, reinstalls, verifies
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "═══════════════════════════════════════════════════════"
echo "  FULL E2E CLEAN MACHINE TEST"
echo "  $(date)"
echo "═══════════════════════════════════════════════════════"

# ── 1. KILL & WIPE ───────────────────────────────────
echo ""
echo "━━━ 1. KILL & WIPE ━━━"
"/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" -Command "Stop-Process -Name klodock -Force -ErrorAction SilentlyContinue; Stop-Process -Name node -Force -ErrorAction SilentlyContinue"
sleep 2
rm -rf ~/.klodock ~/.openclaw 2>/dev/null
rm -f ~/AppData/Roaming/npm/openclaw.cmd 2>/dev/null
rm -rf ~/AppData/Roaming/npm/node_modules/openclaw 2>/dev/null
echo "  Done"

# ── 2. VERIFY CLEAN ──────────────────────────────────
echo ""
echo "━━━ 2. VERIFY CLEAN ━━━"
! test -d ~/.klodock && ok "~/.klodock gone" || fail "~/.klodock exists"
! test -d ~/.openclaw && ok "~/.openclaw gone" || fail "~/.openclaw exists"

# ── 3. INSTALL NODE ──────────────────────────────────
echo ""
echo "━━━ 3. INSTALL NODE ━━━"
NODE_DIR="$HOME/.klodock/node"
mkdir -p "$NODE_DIR"
curl -sL "https://nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip" -o "$HOME/.klodock/node-dl.zip"
"/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" -Command "
Expand-Archive -Path (Join-Path \$env:USERPROFILE '.klodock\node-dl.zip') -DestinationPath (Join-Path \$env:USERPROFILE '.klodock\node-tmp') -Force
Get-ChildItem (Join-Path \$env:USERPROFILE '.klodock\node-tmp\node-v*\*') | Move-Item -Destination (Join-Path \$env:USERPROFILE '.klodock\node') -Force
Remove-Item -Recurse -Force (Join-Path \$env:USERPROFILE '.klodock\node-tmp')
Remove-Item -Force (Join-Path \$env:USERPROFILE '.klodock\node-dl.zip')
"
test -f "$NODE_DIR/node.exe" && ok "Node: $($NODE_DIR/node.exe --version)" || fail "Node missing"

# ── 4. INSTALL OPENCLAW ──────────────────────────────
echo ""
echo "━━━ 4. INSTALL OPENCLAW ━━━"
export PATH="$NODE_DIR:$PATH"
"$NODE_DIR/npm.cmd" install -g openclaw@latest --prefix "$NODE_DIR" > /dev/null 2>&1
test -f "$NODE_DIR/openclaw.cmd" && ok "OpenClaw: $($NODE_DIR/openclaw.cmd --version 2>&1)" || fail "OpenClaw missing"

# ── 5. WRITE CONFIG ──────────────────────────────────
echo ""
echo "━━━ 5. WRITE CONFIG ━━━"
mkdir -p ~/.openclaw/workspace
printf '{"agents":{"defaults":{"model":{"primary":"ollama/qwen2.5:7b"},"workspace":"~/.openclaw/workspace"}},"gateway":{"mode":"local","port":18789,"auth":{"mode":"password","password":"e2e-pass"}}}' > ~/.openclaw/openclaw.json
printf '# Identity\nName: Atlas\n# Role\nGeneral-purpose assistant.\n# Tone\nTone: balanced (0.5)\n' > ~/.openclaw/workspace/SOUL.md
test -f ~/.openclaw/openclaw.json && ok "Config written" || fail "Config missing"
test -f ~/.openclaw/workspace/SOUL.md && ok "SOUL.md written" || fail "SOUL.md missing"

# ── 6. SKILLS ────────────────────────────────────────
echo ""
echo "━━━ 6. SKILLS ━━━"
SKILLS_OUT=$("$NODE_DIR/openclaw.cmd" skills list --json 2>&1)
if echo "$SKILLS_OUT" | grep -q '"skills"'; then
  COUNT=$("$NODE_DIR/node.exe" -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).skills.length)" <<< "$SKILLS_OUT" 2>/dev/null)
  ok "Skills: $COUNT available"
else
  fail "Skills query failed"
fi

# ── 7. START DAEMON ──────────────────────────────────
echo ""
echo "━━━ 7. START DAEMON ━━━"
"$NODE_DIR/openclaw.cmd" gateway --port 18789 > /dev/null 2>&1 &
DAEMON_PID=$!
DAEMON_OK=false
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/__openclaw__/canvas/ 2>&1)
  if [ "$HTTP" = "200" ] || [ "$HTTP" = "401" ] || [ "$HTTP" = "503" ]; then
    ok "Daemon: HTTP $HTTP in ${i}s"
    DAEMON_OK=true
    break
  fi
done
$DAEMON_OK || fail "Daemon not responding after 15s"

# ── 8. ARTIFACTS ─────────────────────────────────────
echo ""
echo "━━━ 8. ARTIFACTS ━━━"
test -f "$NODE_DIR/node.exe" && ok "node.exe" || fail "node.exe"
test -f "$NODE_DIR/openclaw.cmd" && ok "openclaw.cmd" || fail "openclaw.cmd"
test -f ~/.openclaw/openclaw.json && ok "openclaw.json" || fail "openclaw.json"
test -f ~/.openclaw/workspace/SOUL.md && ok "SOUL.md" || fail "SOUL.md"
test -f src-tauri/target/release/bundle/nsis/KloDock_1.2.0_x64-setup.exe && ok "NSIS installer" || fail "NSIS installer"
test -f src-tauri/bundled-skills.json && ok "bundled-skills.json" || fail "bundled-skills.json"
test -f KloDock-README.pdf && ok "PDF" || fail "PDF"

# ── 9. SOURCE QUALITY ────────────────────────────────
echo ""
echo "━━━ 9. SOURCE QUALITY ━━━"
grep -q "SafetyBadge" src/components/SafetyBadge.tsx && ok "SafetyBadge component" || fail "SafetyBadge"
grep -q "test_channel_token" src-tauri/src/lib.rs && ok "Channel verification" || fail "Channel verification"
grep -q "aria-label" src/dashboard/DashboardSkills.tsx && ok "ARIA labels" || fail "No ARIA"
grep -q "text-neutral-600" src/dashboard/Overview.tsx && ok "Contrast fix" || fail "Bad contrast"
grep -q "overflow-hidden" src/components/ProviderCard.tsx && ok "Card overflow" || fail "Card overflow"
grep -q "getVersion" src/dashboard/DashboardUpdates.tsx && ok "Dynamic version" || fail "Hardcoded version"
CASTS=$(grep -rn "as any" src/wizard/ src/dashboard/ 2>/dev/null | wc -l)
[ "$CASTS" -eq 0 ] && ok "Zero as-any casts" || fail "$CASTS as-any casts"

# ── 10. DOCS & LANDING ──────────────────────────────
echo ""
echo "━━━ 10. DOCS & LANDING ━━━"
grep -q "1.2" README.md && ok "README v1.2" || fail "README outdated"
grep -q "1.2" README-full.md && ok "README-full v1.2" || fail "README-full outdated"
grep -q "1.2" README-full.txt && ok "txt v1.2" || fail "txt outdated"
grep -q "v1.2" docs/index.html && ok "Landing v1.2" || fail "Landing outdated"
grep -q "v1.2" website/index.html && ok "Website v1.2" || fail "Website outdated"
grep -qi "access" docs/index.html && ok "Landing: accessibility" || fail "Landing: no accessibility"
grep -qi "pre-commit" README-full.md && ok "README-full: pre-commit" || fail "No pre-commit in docs"
grep -qi "safety badge" README.md && ok "README: safety badges" || fail "No safety badges in README"
for ss in overview skills personality channels settings updates; do
  test -f screenshots/dashboard-$ss.png && ok "Screenshot: $ss" || fail "Missing: $ss"
done
! grep -q "v1\.1[^0-9]" docs/index.html && ok "No stale v1.1" || fail "Stale v1.1"

# ── 11. SECURITY ─────────────────────────────────────
echo ""
echo "━━━ 11. SECURITY ━━━"
LEAKED=$(grep -rn "AIzaSyCsZPauuBaJrkPSIMahuGVcLVPQ6NlvV5M" src/ src-tauri/src/ 2>/dev/null | grep -v REDACTED | wc -l)
[ "$LEAKED" -eq 0 ] && ok "No leaked keys" || fail "Leaked key found"
test -f .git/hooks/pre-commit && ok "Pre-commit hook" || fail "No pre-commit hook"
grep -q "verify_checksum" src-tauri/src/installer/node.rs && ok "SHA256 verification" || fail "No checksum"

# ── CLEANUP ──────────────────────────────────────────
kill $DAEMON_PID 2>/dev/null

# ── SUMMARY ──────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
printf "  PASSED: %d\n" $PASS
printf "  FAILED: %d\n" $FAIL
printf "  TOTAL:  %d\n" $((PASS+FAIL))
echo "═══════════════════════════════════════════════════════"
[ $FAIL -eq 0 ] && echo "✅ FULL E2E CLEAN MACHINE TEST PASSED" || (echo "❌ $FAIL FAILURES" && exit 1)
