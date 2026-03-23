# Claude Code Memory — KloDock

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
