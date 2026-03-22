import { useEffect, useState, useCallback } from "react";
import { FileText, Loader2, Save, CheckCircle2, User, Search, PenTool, Zap, Settings2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ToneSlider } from "@/components/ToneSlider";
import { roleTemplates } from "@/lib/templates";
import { generateSoul, writeSoul } from "@/lib/tauri";
import { useToast } from "@/components/Toast";
import type { Role, SoulConfig } from "@/lib/types";

type RoleType = Role["type"];

interface RoleOption {
  type: RoleType;
  icon: typeof User;
  title: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { type: "GeneralAssistant", icon: User, title: roleTemplates.GeneralAssistant.title, description: roleTemplates.GeneralAssistant.description },
  { type: "ResearchHelper", icon: Search, title: roleTemplates.ResearchHelper.title, description: roleTemplates.ResearchHelper.description },
  { type: "WritingPartner", icon: PenTool, title: roleTemplates.WritingPartner.title, description: roleTemplates.WritingPartner.description },
  { type: "ProductivityBot", icon: Zap, title: roleTemplates.ProductivityBot.title, description: roleTemplates.ProductivityBot.description },
  { type: "Custom", icon: Settings2, title: "Custom", description: "Start from scratch and define your own personality." },
];

function buildRole(roleType: RoleType, customText: string): Role {
  if (roleType === "Custom") return { type: "Custom", value: customText };
  return { type: roleType } as Role;
}

export function DashboardPersonality() {
  const toast = useToast();
  const [soulContent, setSoulContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editor state
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("GeneralAssistant");
  const [customRoleText, setCustomRoleText] = useState("");
  const [tone, setTone] = useState(0.5);
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    invoke<string>("read_soul")
      .then(setSoulContent)
      .catch(() => setSoulContent(null))
      .finally(() => setLoading(false));
  }, []);

  const buildConfig = useCallback((): SoulConfig => ({
    name: name.trim() || "Assistant",
    role: buildRole(roleType, customRoleText),
    tone,
    custom_instructions: instructions.trim() || null,
  }), [name, roleType, customRoleText, tone, instructions]);

  // Update preview when editor fields change
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(async () => {
      try {
        const md = await generateSoul(buildConfig());
        setPreview(md);
      } catch {
        // fallback
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [editing, buildConfig]);

  async function handleSave() {
    const config = buildConfig();
    try {
      const md = await generateSoul(config);
      await writeSoul(md);
      setSoulContent(md);
      setEditing(false);
      setSaved(true);
      toast.success("Personality saved!");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save personality. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  // Editor mode
  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Edit Personality</h2>
            <p className="mt-1 text-sm text-neutral-500">Changes are saved to SOUL.md.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label htmlFor="agent-name" className="block text-sm font-semibold text-neutral-800">
            What should your assistant be called?
          </label>
          <input
            id="agent-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Atlas, Helper, Friday"
            className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Role */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-800">Role</h3>
          <div className="space-y-2">
            {ROLE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = roleType === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setRoleType(opt.type)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                    isSelected ? "border-primary-300 bg-primary-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? "text-primary-600" : "text-neutral-400"}`} />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{opt.title}</p>
                    <p className="text-xs text-neutral-500">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone */}
        <ToneSlider value={tone} onChange={setTone} />

        {/* Instructions */}
        <div className="space-y-2">
          <label htmlFor="instructions" className="block text-sm font-semibold text-neutral-800">
            Any special instructions? (optional)
          </label>
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Always respond in bullet points, Focus on actionable advice"
            rows={3}
            className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {/* Live preview */}
        {preview && (
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
              <FileText className="h-4 w-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-700">Preview</span>
            </div>
            <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-neutral-700 whitespace-pre-wrap font-mono">
              {preview}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // View mode
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Personality</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Your agent's identity and behavior are defined in SOUL.md.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Edit
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 p-3">
          <CheckCircle2 className="h-4 w-4 text-success-500" />
          <p className="text-sm text-success-700">Personality saved!</p>
        </div>
      )}

      {soulContent ? (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
            <FileText className="h-4 w-4 text-neutral-500" />
            <span className="text-sm font-medium text-neutral-700">SOUL.md</span>
          </div>
          <pre className="overflow-x-auto p-5 text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap font-mono">
            {soulContent}
          </pre>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-500">
            No personality configured yet. Click Edit to create one.
          </p>
        </div>
      )}
    </div>
  );
}
