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

## Project Context

- This is a **released open-source project**, not a proof of concept.
- No CLI commands shown to users anywhere — this is a zero-terminal product.
- The KloDock logo is a custom "K" monogram (not Lucide Sparkles — that looked like Gemini).
- Ollama in-app download was added in v1.2.0 — users should never need to open a terminal.
