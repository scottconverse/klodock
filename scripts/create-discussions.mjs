// Creates starter discussion posts on GitHub
// Usage: node scripts/create-discussions.mjs <github-token>

const TOKEN = process.argv[2];
if (!TOKEN) { console.error("Usage: node create-discussions.mjs <token>"); process.exit(1); }

const REPO_ID = "R_kgDORtRkqA";
const CATEGORIES = {
  announcements: "DIC_kwDORtRkqM4C4-xX",
  general: "DIC_kwDORtRkqM4C4-xY",
  ideas: "DIC_kwDORtRkqM4C4-xa",
  qanda: "DIC_kwDORtRkqM4C4-xZ",
  showandtell: "DIC_kwDORtRkqM4C4-xb",
};

const DISCUSSIONS = [
  {
    category: "announcements",
    title: "Welcome to KloDock!",
    body: `KloDock is a desktop GUI that wraps OpenClaw in a visual setup wizard. No terminal, no JSON editing, no markdown.

**Phase 1 (v0.1.0)** ships the full setup wizard:
- Silent Node.js detection and installation
- OpenClaw installation with progress tracking
- API key management with OS credential store encryption (DPAPI/Keychain/libsecret)
- Visual personality builder with live SOUL.md preview
- Telegram and Discord channel setup
- Skill browser with safety ratings
- Agent lifecycle management with auto-restart

The Windows build is verified (MSI: 672 KB, NSIS: 415 KB). macOS and Linux builds are code-complete and awaiting CI validation.

We welcome contributions, bug reports, and feature requests. Check the [README](https://github.com/scottconverse/klodock#readme) for development setup instructions.`
  },
  {
    category: "general",
    title: "Introduce yourself! What do you want your agent to do?",
    body: `Tell us about yourself and what you're hoping to use KloDock + OpenClaw for.

Some questions to get started:
- What's your technical background? (Non-technical, some coding, developer, etc.)
- What do you want your AI agent to do? (Answer questions, summarize emails, manage calendar, etc.)
- Which messaging platform do you prefer? (Telegram, Discord, WhatsApp, etc.)
- Which AI provider are you using or considering? (OpenAI, Anthropic, Gemini, Groq, Ollama, etc.)

This helps us prioritize features and understand who's using KloDock.`
  },
  {
    category: "ideas",
    title: "Feature requests: What should Phase 2 include?",
    body: `Phase 2 is planned to add:
- Agent dashboard with activity feed and health monitoring
- Full skill marketplace browser with search
- SOUL.md visual editor (post-setup editing)
- One-click updates for OpenClaw and skills
- WhatsApp channel support (if Baileys is still viable)
- Config backup and restore

**What else would you want?** Some ideas we're considering:
- Multiple agent profiles (work assistant vs. personal assistant)
- Token usage / cost tracking dashboard
- Custom skill creation wizard
- System tray quick actions
- Slack channel integration

Vote with reactions or reply with your own ideas.`
  },
  {
    category: "qanda",
    title: "FAQ: Common questions about KloDock",
    body: `**Q: Is KloDock free?**
A: Yes. MIT licensed, free forever. No subscriptions, no accounts.

**Q: Does KloDock send my data anywhere?**
A: No. KloDock runs entirely on your machine. Your API keys are stored in your OS credential store (Windows Credential Manager, macOS Keychain, or Linux libsecret). No telemetry, no cloud services.

**Q: Which AI providers does KloDock support?**
A: Six providers: OpenAI, Anthropic (Claude), Google Gemini, Groq, OpenRouter, and Ollama (local/free). You can use any of them - KloDock is not locked to any single provider.

**Q: Can I use Ollama instead of paying for an API?**
A: Yes! If you have Ollama installed and running, KloDock auto-detects it. No API key needed, no cost, no data leaves your machine. You just need a computer with enough RAM to run local models (8GB minimum for small models).

**Q: What platforms does KloDock run on?**
A: Windows (verified), macOS and Linux (code-complete, CI validation pending). The Windows installer is 672 KB.

**Q: What is OpenClaw?**
A: OpenClaw is a fictional open-source AI agent framework used as the basis for this proof-of-concept. KloDock demonstrates the architecture and UX patterns for wrapping any complex CLI tool in a native desktop GUI.

Have a question not covered here? Reply below!`
  },
  {
    category: "general",
    title: "Contributing: How to get involved",
    body: `KloDock is open source and contributions are welcome. Here's how to get started:

**Development setup:**
\`\`\`bash
git clone https://github.com/scottconverse/klodock.git
cd klodock
npm install
npx tauri dev
\`\`\`

**Prerequisites:** Node.js 22+, Rust stable, VS Build Tools (Windows) or Xcode CLI tools (macOS).

**Good first issues:**
- macOS autostart implementation (\`src-tauri/src/process/autostart/macos.rs\`) - needs Login Item via SMAppService
- Linux autostart implementation (\`src-tauri/src/process/autostart/linux.rs\`) - needs XDG .desktop file
- E2E test implementation (\`e2e/\` directory has documented stubs)
- Additional frontend tests for wizard screens

**Architecture overview:**
- Rust backend: \`src-tauri/src/\` (28 modules covering install, config, secrets, daemon, skills)
- React frontend: \`src/\` (8 wizard screens, 7 components, dashboard shell)
- Tests: \`vitest\` for frontend, \`cargo test\` for Rust

See the [full README](https://github.com/scottconverse/klodock/blob/main/README-full.md) for detailed architecture docs.`
  },
  {
    category: "showandtell",
    title: "Build log: From PRD to working Windows installer in one session",
    body: `KloDock was built from a PRD to a working Windows installer (.msi + .exe) in a single development session. Here's what was accomplished:

**Architecture:**
- Tauri v2 (Rust backend + React frontend)
- 28 Rust modules, 8 wizard screens, 7 shared components
- 118 files, 19,413 lines of code

**Key spikes that proved the architecture:**
- Silent Node.js install on Windows: download 33MB zip, SHA256 verify, PowerShell extract, no admin needed
- DPAPI secret storage: Windows Credential Manager's keyring crate has a round-trip bug, so we use DPAPI via PowerShell instead
- Daemon lifecycle: PID tracking, process alive detection, .env materialization/scrubbing all verified

**Test results:**
- 19 frontend tests passing (vitest)
- 12 Rust integration tests passing (cargo test)
- Full Tauri build: MSI 672 KB, NSIS 415 KB

**What's real vs. stubbed:**
- Real: Node.js installer, secret store, daemon lifecycle, SOUL.md generator, autostart, uninstall
- Stubbed: ClawHub API calls, OpenClaw update endpoints (external services that don't exist)

The PRD, spike results, and full README are all in the repo.`
  },
];

async function createDiscussion(title, body, categoryId) {
  const query = `mutation($input: CreateDiscussionInput!) {
    createDiscussion(input: $input) {
      discussion { url }
    }
  }`;

  const resp = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `token ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          repositoryId: REPO_ID,
          categoryId,
          title,
          body,
        }
      }
    }),
  });

  const data = await resp.json();
  if (data.errors) {
    console.error(`  FAILED: ${title}`, data.errors[0].message);
    return null;
  }
  return data.data.createDiscussion.discussion.url;
}

async function main() {
  console.log("Creating starter discussions...\n");

  for (const d of DISCUSSIONS) {
    const categoryId = CATEGORIES[d.category];
    process.stdout.write(`  ${d.category}: "${d.title}" ... `);
    const url = await createDiscussion(d.title, d.body, categoryId);
    if (url) {
      console.log(`OK -> ${url}`);
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
