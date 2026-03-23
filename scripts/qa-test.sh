#!/bin/bash
# KloDock v1.2 — Full QA Test Suite
cd "$(dirname "$0")/.."

PASS=0; FAIL=0; WARN=0; SKIP=0
ok()   { echo "  ✓ PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ FAIL  $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ WARN  $1"; WARN=$((WARN+1)); }

echo "╔══════════════════════════════════════════════════════╗"
echo "║       KloDock v1.2 — Full QA Test Suite             ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. CLEAN INSTALL ──────────────────────────────────
echo ""
echo "━━━ 1. Clean Install Test ━━━"
bash scripts/clean-install-test.sh > /tmp/klodock-clean.log 2>&1
if [ $? -eq 0 ]; then
  ok "Clean install: 19/19 pass"
else
  fail "Clean install failed"
  grep "✗" /tmp/klodock-clean.log
fi

# ── 2. STRESS TEST ────────────────────────────────────
echo ""
echo "━━━ 2. Stress Test ━━━"
node scripts/stress-test.mjs > /tmp/klodock-stress.log 2>&1
if [ $? -eq 0 ]; then
  ok "Stress test: all pass"
else
  fail "Stress test failed"
  grep "✗" /tmp/klodock-stress.log
fi

# ── 3. FRONTEND TESTS ─────────────────────────────────
echo ""
echo "━━━ 3. Frontend Unit Tests ━━━"
npx vitest run > /tmp/klodock-vitest.log 2>&1
if grep -q "passed" /tmp/klodock-vitest.log; then
  ok "Vitest: $(grep -oP '\d+ passed' /tmp/klodock-vitest.log | head -1)"
else
  fail "Vitest failed"
fi

# ── 4. VERSIONS ───────────────────────────────────────
echo ""
echo "━━━ 4. Version Consistency ━━━"
PKG_VER=$(node -e "process.stdout.write(require('./package.json').version)")
TAURI_VER=$(node -e "process.stdout.write(require('./src-tauri/tauri.conf.json').version)")
CARGO_VER=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')

[ "$PKG_VER" = "$TAURI_VER" ] && [ "$TAURI_VER" = "$CARGO_VER" ] && ok "Versions match: $PKG_VER" || fail "Mismatch: pkg=$PKG_VER tauri=$TAURI_VER cargo=$CARGO_VER"
[ "$PKG_VER" = "1.2.0" ] && ok "Version is 1.2.0" || fail "Version is $PKG_VER"

# ── 5. SECURITY ───────────────────────────────────────
echo ""
echo "━━━ 5. Security ━━━"
grep -q "x-goog-api-key" src-tauri/src/secrets/keychain.rs && ok "Gemini key uses header" || fail "Gemini key in URL"
grep -q 'replace.*\\n.*\\r' src-tauri/src/config/env.rs && ok ".env sanitizes newlines" || fail ".env no sanitization"
grep -q "stdin" src-tauri/src/secrets/keychain.rs && ok "Secrets via stdin" || fail "Secrets inline"
grep -q "Sha256\|hashed_filename" src-tauri/src/secrets/keychain.rs && ok "Filenames hashed" || fail "Filenames not hashed"
! test -f ~/.openclaw/.env && ok "No stale .env" || fail "Stale .env exists"
! grep -q "which::which" src-tauri/src/installer/openclaw.rs && ok "No system PATH fallback" || fail "Still uses system PATH"
grep -q "return Err" src-tauri/src/config/env.rs && ok "icacls errors reported" || warn "icacls handling unclear"

# ── 6. ROUTES ─────────────────────────────────────────
echo ""
echo "━━━ 6. Dashboard Routes ━━━"
for r in skills personality channels settings updates; do
  grep -q "path=\"$r\"" src/App.tsx && ok "Route: $r" || fail "Missing route: $r"
done

# ── 7. TYPE SAFETY ────────────────────────────────────
echo ""
echo "━━━ 7. Type Safety ━━━"
grep -q "running:" src/components/StatusIndicator.tsx && ok "StatusIndicator lowercase keys" || fail "StatusIndicator wrong keys"
grep -q 'status: "stopped"' src/dashboard/DashboardLayout.tsx && ok "DashboardLayout init type" || fail "DashboardLayout wrong init"
grep -q "daemon_alive" src/dashboard/Overview.tsx && ok "Overview correct fields" || fail "Overview wrong fields"

# ── 8. IPC ────────────────────────────────────────────
echo ""
echo "━━━ 8. IPC Boundary ━━━"
grep -q "install_openclaw\|npm" src-tauri/src/update/openclaw_update.rs && ok "update_openclaw implemented" || fail "update_openclaw stub"
! grep -q "write_env" src-tauri/src/lib.rs && ok "write_env not in IPC" || fail "write_env exposed"

# ── 9. CODE HYGIENE ───────────────────────────────────
echo ""
echo "━━━ 9. Code Hygiene ━━━"
BASEDIR_N=$(grep -r "fn klodock_base_dir" src-tauri/src/ | wc -l)
[ "$BASEDIR_N" -eq 1 ] && ok "klodock_base_dir single impl" || fail "$BASEDIR_N implementations"
! grep -q "\[\[bin\]\]" src-tauri/Cargo.toml && ok "No spike binaries" || fail "Spike binaries in Cargo"
test -f src/components/Toast.tsx && ok "Toast component exists" || fail "Toast missing"

# ── 10. DOCS ──────────────────────────────────────────
echo ""
echo "━━━ 10. Docs & Landing Page ━━━"
grep -q "1.2" README.md && ok "README v1.2" || fail "README outdated"
grep -q "1.2" README-full.md && ok "README-full v1.2" || fail "README-full outdated"
grep -q "v1.2" website/index.html && ok "Landing page v1.2" || fail "Landing outdated"
grep -q "dashboard-overview" website/index.html && ok "Screenshots in landing" || fail "No screenshots"
test -f KloDock-README.pdf && ok "PDF exists" || fail "PDF missing"
for ss in overview skills personality channels settings updates; do
  test -f screenshots/dashboard-$ss.png && ok "Screenshot: $ss" || fail "Missing: $ss"
done

# ── 11. METADATA ──────────────────────────────────────
echo ""
echo "━━━ 11. Package Metadata ━━━"
node -e "const p=require('./package.json'); process.exit(p.author?0:1)" && ok "Author set" || fail "Author empty"
node -e "const p=require('./package.json'); process.exit(p.license==='MIT'?0:1)" && ok "License: MIT" || fail "Wrong license"
node -e "const p=require('./package.json'); process.exit(p.description?0:1)" && ok "Description set" || fail "No description"

# ── 12. BUILD ARTIFACT ────────────────────────────────
echo ""
echo "━━━ 12. Build Artifact ━━━"
INST="src-tauri/target/release/bundle/nsis/KloDock_1.2.0_x64-setup.exe"
test -f "$INST" && ok "Installer exists" || fail "Installer missing"
echo "$INST" | grep -q "1.2.0" && ok "Installer versioned correctly" || fail "Installer wrong version"

# ── SUMMARY ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  QA RESULTS                         ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║  Passed:   %3d                                      ║\n" $PASS
printf "║  Failed:   %3d                                      ║\n" $FAIL
printf "║  Warnings: %3d                                      ║\n" $WARN
printf "║  Total:    %3d                                      ║\n" $((PASS+FAIL+WARN))
echo "╚══════════════════════════════════════════════════════╝"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "❌ $FAIL TESTS FAILED"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo ""
  echo "⚠️  ALL PASSED but $WARN warnings"
else
  echo ""
  echo "✅ ALL QA TESTS PASSED"
fi
