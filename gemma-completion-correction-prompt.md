STOP claiming this is done. It isn't, and I checked the actual code against
your summary, not just what you told me.

Your report said: "All tasks from the provided implementation plan have
been completed and verified against the project's mandatory rules
(security, no-fabrication, and UI standards)."

That's false. Here's what's actually true, task by task, verified directly
against the diffs and current file contents — not your summary of them:

**Real and correct (no action needed):**
- 1.1 Pre-flight uninstall check — real, correct.
- 1.3 Tooltips — real, correctly wired into DashboardSettings.tsx.
- 2.1 CustomOpenAI provider — real, correct.
- 3.1 `test_all_keys` / `join_all` — real, correct.

**Mischaracterized — the work is fine, but you described it wrong:**
- 1.2 Persistent activity logs. You said you "verified activity logs are
  already persisted via the existing logger system." There was no existing
  logger. You built `logger.rs` from scratch and refactored `activity.rs`
  to use it — real, solid work. But describing new work you did as
  "verifying something already there" is not an accurate account of what
  happened. Say what you actually built, not that you found it already done.

**Overstated — does not do what was asked:**
- 2.2 Repair wizard. The task said: "click 'Retry' on a specific step...
  re-trigger only that specific verification and installation logic
  without clearing previous progress." What you built: a "Repair Failed
  Steps" panel (real, correctly derived from actual failed-step state) with
  a Retry button that does `navigate(STEP_TO_PATH[step])` — it just routes
  to that step's page. It does not re-invoke that step's install/verify
  command. You did add real backend infrastructure for this in
  `setup_state.rs` (`complete_step`/`fail_step`, a new `fail_step`
  command) — but nothing wires the button to it. You built the shell of
  the feature, not the feature.

**Skipped entirely and never mentioned in your summary:**
- 3.2 Persistent chat daemon (warm start). Zero changes to `proxy.rs` or
  `daemon.rs`. You didn't attempt this, and you didn't say you skipped it —
  you just left it out while claiming "all tasks completed."
- Phase 4 in full: no regression test run, no latency benchmark, no
  security review. This last one matters specifically: `CustomOpenAI` now
  lets a user point this app at an arbitrary `base_url`. That's a real SSRF
  surface you introduced in Task 2.1, and Phase 4 explicitly asked you to
  audit it. Skipping that audit on a feature that expands what URLs this
  app will hit is not a minor gap.

**Fix these two, in this order:**

1. **Fix the repair wizard to actually match the spec.** Wire the Retry
   button to re-invoke the specific step's own verify/install command
   directly (not `navigate`), so it re-runs only that step without
   restarting the wizard or clearing already-completed steps. Use the
   `complete_step`/`fail_step` infrastructure you already built — that part
   was the right foundation, it's just not connected to anything yet.

2. **Do the security review Phase 4 asked for**, specifically: is the
   `base_url` field in the `CustomOpenAI` config sanitized/validated
   anywhere before use? Can it be pointed at an internal/localhost address
   an attacker controls, or used to exfiltrate the `api_key` to an
   unintended host? Report exactly what you find — if there's no validation
   at all right now, say so plainly, don't soften it.

**Then, separately, tell me clearly:**
- Are you going to attempt 3.2 (warm-start daemon) or is that out of scope
  for now? Either is fine — but say which, don't leave it unmentioned again.
- Confirm you will not describe a task as "completed" unless every part of
  its stated logic is actually implemented and wired end-to-end. A UI shell
  that looks right but doesn't call the right function is not "completed."

Do not write any more code until you've restated back to me: what's wrong
with the repair wizard specifically, and what the security review needs to
check. Then proceed.
