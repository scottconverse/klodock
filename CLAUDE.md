# Claude Code Memory — KloDock

## MANDATORY SECURITY RULES

- **NEVER** publish, commit, or include ANY API key, secret, token, or credential from ANY provider (Google, Anthropic, OpenAI, Groq, or any other) to GitHub or any public repository. **No exceptions. No test keys. No spike files. No hardcoded values. EVER.**
- **NEVER** hardcode real API keys in test code, spike code, example code, or any source file. Use placeholder strings like `"test-key-placeholder"` or environment variables.
- **ALWAYS** use `.gitignore` to exclude any file that might contain secrets (`.env`, `secrets/`, `*.key`).
- Before every commit, grep the staged changes for API key patterns (`AIza`, `sk-`, `gsk_`, `ghp_`, `xoxb-`). If found, **STOP and remove them**.

## Release Rules

- **ALWAYS** check ALL docs (README.md, README-full.md, README-full.txt), landing pages (docs/index.html, website/index.html), and PDF (KloDock-README.pdf) before ANY release. Every version reference, feature claim, and screenshot must match the actual code. No exceptions.
- **ALWAYS** run a full end-to-end clean machine test before pushing a release tag.
- **ALWAYS** regenerate the PDF when version or features change.
- **NEVER** push a release without verifying landing page content matches the release.

## UI Design Rules — MANDATORY

BEFORE declaring any UI work done, perform the **User Walkthrough**:

1. Start from wherever the user would start (not where the developer is)
2. Click/navigate through every path the change affects
3. For each screen, answer:
   - What does the user see FIRST? Is it the right thing?
   - What should they do next? Is it obvious without reading?
   - What happens when they do it? Does the result match expectation?
   - What happens when they do it WRONG? Is the error helpful?
   - Can they get back to where they were? How?
4. Check every text label: would a non-technical person understand it?
5. Check every button: does it do what the label says?
6. Check every state transition: does the UI update immediately?
7. Check focus: after every action, is the cursor where the user expects it?
8. Check consistency: does this screen behave like every other screen?

**If you cannot answer all of these, you are not done.**

### UI — What You Never Do

- You **never** show a raw error message from the backend
- You **never** leave the user on a dead-end screen with no action
- You **never** show contradictory state (e.g., "Running" in one place and "Stopped" in another)
- You **never** require the user to know something the app already knows
- You **never** ship a UI change without clicking through it yourself
- You **never** show an empty input field for data the app has already stored
- You **never** add a button that does nothing or leads nowhere
- You **never** duplicate the same action in two places on the same screen
- You **never** assume the user knows which page to go to — the current page should have the action they need
- You **never** lose the user's selection when they navigate away and come back

## Project Context

- This is a **released open-source project**, not a proof of concept.
- No CLI commands shown to users anywhere — this is a zero-terminal product.
- The KloDock logo is a custom "K" monogram (not Lucide Sparkles — that looked like Gemini).
- Ollama in-app download was added in v1.2.0 — users should never need to open a terminal.
