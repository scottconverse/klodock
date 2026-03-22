import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, CheckCircle2, XCircle, ExternalLink, Download,
  RefreshCw, Search, Monitor, ChevronDown, ChevronUp,
  MessageSquare, Code2, Music, Home, Wrench,
  FileText, Image, Globe, ShieldCheck,
} from "lucide-react";
import { listAllSkills } from "@/lib/tauri";
import { open } from "@tauri-apps/plugin-shell";
import type { SkillMetadata } from "@/lib/types";

/* ── Categories ─────────────────────────────────────────── */

interface Category {
  id: string;
  label: string;
  icon: typeof MessageSquare;
}

const CATEGORIES: Category[] = [
  { id: "communication", label: "Communication",    icon: MessageSquare },
  { id: "productivity",  label: "Productivity",     icon: FileText },
  { id: "developer",     label: "Developer Tools",  icon: Code2 },
  { id: "media",         label: "Media & Audio",    icon: Music },
  { id: "smart-home",    label: "Smart Home",       icon: Home },
  { id: "ai-services",   label: "AI Services",      icon: Globe },
  { id: "images",        label: "Images & Video",   icon: Image },
  { id: "system",        label: "System & Security", icon: ShieldCheck },
  { id: "other",         label: "Other",            icon: Wrench },
];

const SKILL_CATEGORIES: Record<string, string> = {
  // Communication
  "telegram":        "communication", // (implicit — always via channels)
  "discord":         "communication",
  "slack":           "communication",
  "bluebubbles":     "communication",
  "imsg":            "communication",
  "wacli":           "communication",
  "himalaya":        "communication",
  "voice-call":      "communication",
  "xurl":            "communication",

  // Productivity
  "notion":          "productivity",
  "obsidian":        "productivity",
  "apple-notes":     "productivity",
  "bear-notes":      "productivity",
  "apple-reminders": "productivity",
  "things-mac":      "productivity",
  "trello":          "productivity",
  "gog":             "productivity",
  "session-logs":    "productivity",
  "summarize":       "productivity",
  "blogwatcher":     "productivity",
  "ordercli":        "productivity",
  "goplaces":        "productivity",

  // Developer Tools
  "github":          "developer",
  "gh-issues":       "developer",
  "coding-agent":    "developer",
  "skill-creator":   "developer",
  "clawhub":         "developer",
  "mcporter":        "developer",
  "tmux":            "developer",
  "nano-pdf":        "developer",

  // Media & Audio
  "spotify-player":  "media",
  "openai-whisper":  "media",
  "openai-whisper-api": "media",
  "sag":             "media",
  "sherpa-onnx-tts": "media",
  "songsee":         "media",
  "blucli":          "media",
  "sonoscli":        "media",

  // Smart Home
  "openhue":         "smart-home",
  "eightctl":        "smart-home",
  "camsnap":         "smart-home",

  // AI Services
  "gemini":          "ai-services",
  "oracle":          "ai-services",
  "model-usage":     "ai-services",

  // Images & Video
  "openai-image-gen": "images",
  "nano-banana-pro": "images",
  "video-frames":    "images",
  "gifgrep":         "images",
  "peekaboo":        "images",

  // System & Security
  "healthcheck":     "system",
  "node-connect":    "system",
  "1password":       "system",
  "weather":         "system",
};

/* ── Friendly requirement descriptions ──────────────────── */

/** User-friendly descriptions for binary requirements */
const FRIENDLY_BINS: Record<string, { what: string; url?: string }> = {
  gh:            { what: "GitHub CLI app",             url: "https://cli.github.com" },
  ffmpeg:        { what: "FFmpeg video tool",          url: "https://ffmpeg.org/download.html" },
  jq:            { what: "jq data tool",               url: "https://jqlang.github.io/jq/download/" },
  rg:            { what: "ripgrep search tool",        url: "https://github.com/BurntSushi/ripgrep/releases" },
  clawhub:       { what: "ClawHub app",                url: "https://clawhub.ai/download" },
  summarize:     { what: "Summarize app",              url: "https://clawhub.ai/skills/summarize" },
  op:            { what: "1Password app",              url: "https://1password.com/downloads/command-line" },
  uv:            { what: "uv Python manager",          url: "https://docs.astral.sh/uv/" },
  python3:       { what: "Python",                     url: "https://python.org/downloads/" },
  whisper:       { what: "Whisper speech-to-text app", url: "https://github.com/openai/whisper" },
  claude:        { what: "Claude Code",                url: "https://docs.anthropic.com/en/docs/claude-code" },
  codex:         { what: "OpenAI Codex",               url: "https://github.com/openai/codex" },
  "obsidian-cli":{ what: "Obsidian CLI",               url: "https://obsidian.md" },
  himalaya:      { what: "Himalaya email app",         url: "https://github.com/pimalaya/himalaya" },
  tmux:          { what: "tmux terminal multiplexer" },
  gemini:        { what: "Gemini CLI",                 url: "https://github.com/google-gemini/gemini-cli" },
  openhue:       { what: "OpenHue app",                url: "https://github.com/openhue/openhue-cli" },
  sonos:         { what: "Sonos CLI",                  url: "https://github.com/bwaters/sonos-cli" },
  memo:          { what: "Memo (Apple Notes CLI)" },
  remindctl:     { what: "Remindctl (Apple Reminders CLI)" },
  grizzly:       { what: "Grizzly (Bear Notes CLI)" },
  things:        { what: "Things CLI" },
  imsg:          { what: "iMsg CLI" },
  peekaboo:      { what: "Peekaboo screen capture" },
  codexbar:      { what: "CodexBar usage tracker" },
  "nano-pdf":    { what: "Nano PDF editor" },
};

/** User-friendly descriptions for env var requirements */
const FRIENDLY_ENV: Record<string, string> = {
  OPENAI_API_KEY:         "an OpenAI account",
  NOTION_API_KEY:         "a Notion account",
  GOOGLE_PLACES_API_KEY:  "a Google Places API key",
  GEMINI_API_KEY:         "a Google Gemini API key",
  ELEVENLABS_API_KEY:     "an ElevenLabs account",
  TRELLO_API_KEY:         "a Trello account",
  TRELLO_TOKEN:           "a Trello account",
  SHERPA_ONNX_RUNTIME_DIR: "Sherpa ONNX set up",
  SHERPA_ONNX_MODEL_DIR:  "Sherpa ONNX models",
};

/* ── Requirement parser ─────────────────────────────────── */

interface ParsedReq {
  label: string;
  action?: { type: "download"; url: string; label: string }
         | { type: "navigate"; to: string; label: string };
  platformLocked?: string; // "macOS" or "Linux"
}

function parseRequirements(reqs: string[]): ParsedReq[] {
  const parsed: ParsedReq[] = [];
  // Deduplicate env vars that map to the same friendly name
  const seen = new Set<string>();

  for (const req of reqs) {
    if (req.startsWith("Requires: darwin") || req.startsWith("Requires: linux")) {
      const os = req.includes("darwin") ? "macOS" : "Linux";
      parsed.push({ label: `Only available on ${os}`, platformLocked: os });
      continue;
    }

    if (req.startsWith("Requires one of: ")) {
      const bins = req.replace("Requires one of: ", "").split(", ");
      // Find the best one with a download link
      for (const bin of bins) {
        const info = FRIENDLY_BINS[bin];
        if (info?.url) {
          parsed.push({
            label: `Needs ${info.what}`,
            action: { type: "download", url: info.url, label: `Get ${info.what}` },
          });
          break;
        }
      }
      if (parsed.length === 0 || parsed[parsed.length - 1].label !== `Needs ${FRIENDLY_BINS[bins[0]]?.what}`) {
        const names = bins.map(b => FRIENDLY_BINS[b]?.what ?? b).join(" or ");
        parsed.push({ label: `Needs ${names}` });
      }
      continue;
    }

    if (req.startsWith("Requires: ")) {
      const bin = req.replace("Requires: ", "");
      const info = FRIENDLY_BINS[bin];
      parsed.push({
        label: info ? `Needs ${info.what}` : `Needs ${bin}`,
        action: info?.url ? { type: "download", url: info.url, label: `Get ${info.what}` } : undefined,
      });
      continue;
    }

    if (req.startsWith("Needs env: ")) {
      const envVar = req.replace("Needs env: ", "");
      const friendly = FRIENDLY_ENV[envVar];
      const key = friendly ?? envVar;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({
        label: friendly ? `Needs ${friendly}` : `Needs API key configured`,
        action: { type: "navigate", to: "/dashboard/settings", label: "Add in Settings" },
      });
      continue;
    }

    if (req.startsWith("Needs config: ")) {
      const cfg = req.replace("Needs config: ", "");
      if (cfg.startsWith("channels.")) {
        const channel = cfg.split(".")[1];
        const name = channel.charAt(0).toUpperCase() + channel.slice(1);
        parsed.push({
          label: `Needs ${name} connected`,
          action: { type: "navigate", to: "/dashboard/channels", label: `Set up ${name}` },
        });
      } else {
        parsed.push({ label: `Needs additional configuration` });
      }
      continue;
    }

    parsed.push({ label: req });
  }

  return parsed;
}

/* ── Main component ─────────────────────────────────────── */

export function DashboardSkills() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | false>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showMoreSkills, setShowMoreSkills] = useState(false);

  const loadSkills = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      setSkills(await listAllSkills());
    } catch (err: any) {
      const msg = err?.toString() ?? "";
      if (msg.includes("timed out") || msg.includes("not running")) {
        setError("Your agent isn't running. Start it from the Overview page, then come back here.");
      } else if (msg.includes("not installed") || msg.includes("not found")) {
        setError("OpenClaw isn't installed yet. Complete the setup wizard first.");
      } else {
        setError("Could not load skills. Try starting your agent first.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  async function openLink(url: string) {
    try { await open(url); } catch { window.open(url, "_blank"); }
  }

  // Filter skills by search + category
  const filtered = useMemo(() => {
    let list = skills;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q)
      );
    }

    if (activeCategory) {
      list = list.filter((s) => (SKILL_CATEGORIES[s.slug] ?? "other") === activeCategory);
    }

    return list;
  }, [skills, searchQuery, activeCategory]);

  // Determine if a skill is "actionable" — active, platform-locked, or all reqs have actions
  const isActionable = useCallback((skill: SkillMetadata): boolean => {
    if (skill.eligible) return true;
    const reqs = parseRequirements(skill.missing_requirements);
    const isPlatformLocked = reqs.some((r) => r.platformLocked);
    if (isPlatformLocked) return true;
    // Actionable if every requirement has a download or navigate action
    return reqs.length > 0 && reqs.every((r) => r.action);
  }, []);

  // Split into actionable (shown in grid) and no-action (collapsed list)
  const { actionableFiltered, noActionFiltered } = useMemo(() => {
    const actionable: SkillMetadata[] = [];
    const noAction: SkillMetadata[] = [];
    for (const skill of filtered) {
      if (isActionable(skill)) actionable.push(skill);
      else noAction.push(skill);
    }
    noAction.sort((a, b) => a.name.localeCompare(b.name));
    return { actionableFiltered: actionable, noActionFiltered: noAction };
  }, [filtered, isActionable]);

  // Group actionable skills by category (preserving order)
  const grouped = useMemo(() => {
    const groups: { category: Category; skills: SkillMetadata[] }[] = [];
    const catMap = new Map<string, SkillMetadata[]>();

    for (const skill of actionableFiltered) {
      const catId = SKILL_CATEGORIES[skill.slug] ?? "other";
      if (!catMap.has(catId)) catMap.set(catId, []);
      catMap.get(catId)!.push(skill);
    }

    for (const cat of CATEGORIES) {
      const items = catMap.get(cat.id);
      if (items && items.length > 0) {
        items.sort((a, b) => {
          if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        groups.push({ category: cat, skills: items });
      }
    }

    return groups;
  }, [actionableFiltered]);

  const activeCount = skills.filter((s) => s.eligible).length;
  const totalCount = skills.length;

  // Category counts for the filter chips
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of skills) {
      const catId = SKILL_CATEGORIES[s.slug] ?? "other";
      counts[catId] = (counts[catId] ?? 0) + 1;
    }
    return counts;
  }, [skills]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <XCircle className="mx-auto h-10 w-10 text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-600">
          {error}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="
              inline-flex items-center gap-1.5 rounded-lg bg-primary-600
              px-4 py-2 text-sm font-medium text-white hover:bg-primary-700
            "
          >
            Go to Overview
          </button>
          <button
            type="button"
            onClick={() => loadSkills()}
            className="
              inline-flex items-center gap-1.5 rounded-lg border border-neutral-200
              px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50
            "
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900">Skills</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadSkills(true)}
              disabled={refreshing}
              className="
                inline-flex items-center gap-1.5 rounded-lg border
                border-neutral-200 px-3 py-1.5 text-xs font-medium
                text-neutral-600 hover:bg-neutral-50 disabled:opacity-50
              "
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Checking..." : "Check again"}
            </button>
            <button
              type="button"
              onClick={() => openLink("https://clawhub.ai")}
              className="
                inline-flex items-center gap-1.5 rounded-lg border
                border-neutral-200 px-3 py-1.5 text-xs font-medium
                text-neutral-600 hover:bg-neutral-50
              "
            >
              Browse ClawHub
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Your agent has {totalCount} skills. {activeCount} are active now —
          the rest need a quick setup to unlock.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search skills... (e.g., email, music, GitHub)"
          className="
            w-full rounded-lg border border-neutral-200 bg-white
            pl-9 pr-3 py-2 text-sm placeholder:text-neutral-400
            focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100
          "
        />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !activeCategory
              ? "bg-primary-600 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          All ({totalCount})
        </button>
        {CATEGORIES.filter((c) => categoryCounts[c.id]).map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-primary-600 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              <Icon className="h-3 w-3" />
              {cat.label} ({categoryCounts[cat.id]})
            </button>
          );
        })}
      </div>

      {/* Skill list grouped by category */}
      {actionableFiltered.length === 0 && noActionFiltered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-neutral-400">
            No skills match "{searchQuery}". Try a different search.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, skills: catSkills }) => {
            const CatIcon = category.icon;
            return (
              <div key={category.id}>
                {/* Category header — only show when not filtered to a single category */}
                {!activeCategory && (
                  <div className="flex items-center gap-2 mb-3">
                    <CatIcon className="h-4 w-4 text-neutral-400" />
                    <h3 className="text-sm font-semibold text-neutral-700">
                      {category.label}
                    </h3>
                    <div className="flex-1 border-t border-neutral-100" />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {catSkills.map((skill) => {
                    const reqs = parseRequirements(skill.missing_requirements);
                    const isPlatformLocked = reqs.some((r) => r.platformLocked);

                    return (
                      <div
                        key={skill.slug}
                        className={`
                          rounded-xl border p-4 transition-all
                          ${skill.eligible
                            ? "border-success-200 bg-success-50/40"
                            : isPlatformLocked
                              ? "border-neutral-150 bg-neutral-50 opacity-60"
                              : "border-neutral-200 bg-white shadow-sm"
                          }
                        `}
                      >
                        {/* Top row: name + status */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-neutral-900">
                            {skill.name}
                          </h4>
                          {skill.eligible ? (
                            <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-medium text-success-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </span>
                          ) : isPlatformLocked ? (
                            <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                              <Monitor className="h-3 w-3" />
                              {reqs.find((r) => r.platformLocked)?.platformLocked}
                            </span>
                          ) : null}
                        </div>

                        {/* Description */}
                        <p className="text-xs leading-relaxed text-neutral-500 line-clamp-2 mb-2">
                          {skill.description}
                        </p>

                        {/* Requirements (only for non-active, non-platform-locked) */}
                        {!skill.eligible && !isPlatformLocked && reqs.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-neutral-100">
                            {reqs.map((req, i) => (
                              <div key={i}>
                                <p className="text-xs text-amber-600 mb-1.5">
                                  {req.label}
                                </p>
                                {req.action?.type === "download" && (
                                  <button
                                    type="button"
                                    onClick={() => openLink((req.action as any).url)}
                                    className="
                                      w-full inline-flex items-center justify-center gap-1.5
                                      rounded-lg border border-primary-200 bg-primary-50
                                      px-3 py-1.5 text-xs font-medium text-primary-700
                                      hover:bg-primary-100
                                    "
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Get it
                                  </button>
                                )}
                                {req.action?.type === "navigate" && (
                                  <button
                                    type="button"
                                    onClick={() => navigate((req.action as any).to)}
                                    className="
                                      w-full inline-flex items-center justify-center gap-1.5
                                      rounded-lg border border-primary-200 bg-primary-50
                                      px-3 py-1.5 text-xs font-medium text-primary-700
                                      hover:bg-primary-100
                                    "
                                  >
                                    {req.action.label}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsed "more skills" — no-action skills */}
      {noActionFiltered.length > 0 && (
        <div className="border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={() => setShowMoreSkills(!showMoreSkills)}
            className="
              flex w-full items-center justify-between rounded-lg
              px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50
            "
          >
            <span>
              {noActionFiltered.length} more skill{noActionFiltered.length !== 1 ? "s" : ""} available
              <span className="ml-1 text-xs text-neutral-400">
                (need additional software)
              </span>
            </span>
            {showMoreSkills ? (
              <ChevronUp className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            )}
          </button>

          {showMoreSkills && (
            <div className="mt-2 rounded-lg bg-neutral-50 border border-neutral-100 p-3">
              <p className="text-xs text-neutral-500 mb-3">
                These skills need software that isn't available as a simple download yet.
                They'll activate automatically if the required tool is installed on your system.
              </p>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {noActionFiltered.map((skill) => {
                  const reqs = parseRequirements(skill.missing_requirements);
                  const reqLabel = reqs[0]?.label ?? "";
                  return (
                    <div
                      key={skill.slug}
                      className="flex items-baseline justify-between gap-2 py-1"
                    >
                      <span className="text-xs font-medium text-neutral-700 truncate">
                        {skill.name}
                      </span>
                      <span className="text-[11px] text-neutral-400 shrink-0 truncate max-w-[140px]">
                        {reqLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
