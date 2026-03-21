import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { User, Search, PenTool, Zap, Settings2 } from "lucide-react";
import { ToneSlider } from "@/components/ToneSlider";
import { roleTemplates } from "@/lib/templates";
import { generateSoul, completeStep, writeSoul } from "@/lib/tauri";
import type { Role, SoulConfig } from "@/lib/types";

/** Role type string for indexing templates and display. */
type RoleType = Role["type"];

interface RoleOption {
  type: RoleType;
  icon: typeof User;
  title: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    type: "GeneralAssistant",
    icon: User,
    title: roleTemplates.GeneralAssistant.title,
    description: roleTemplates.GeneralAssistant.description,
  },
  {
    type: "ResearchHelper",
    icon: Search,
    title: roleTemplates.ResearchHelper.title,
    description: roleTemplates.ResearchHelper.description,
  },
  {
    type: "WritingPartner",
    icon: PenTool,
    title: roleTemplates.WritingPartner.title,
    description: roleTemplates.WritingPartner.description,
  },
  {
    type: "ProductivityBot",
    icon: Zap,
    title: roleTemplates.ProductivityBot.title,
    description: roleTemplates.ProductivityBot.description,
  },
  {
    type: "Custom",
    icon: Settings2,
    title: "Custom",
    description: "Start from scratch and define your own personality.",
  },
];

/** Build the Role tagged-union value that matches the Rust serde format. */
function buildRole(roleType: RoleType, customText: string): Role {
  if (roleType === "Custom") {
    return { type: "Custom", value: customText };
  }
  // The non-Custom variants have no `value` field.
  return { type: roleType } as Role;
}

export function Personality() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("GeneralAssistant");
  const [customRoleText, setCustomRoleText] = useState("");
  const [tone, setTone] = useState(0.5);
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");

  const buildConfig = useCallback((): SoulConfig => {
    return {
      name: name.trim() || "Assistant",
      role: buildRole(roleType, customRoleText),
      tone,
      custom_instructions: instructions.trim() || null,
    };
  }, [name, roleType, customRoleText, tone, instructions]);

  const updatePreview = useCallback(async () => {
    const config = buildConfig();
    try {
      const md = await generateSoul(config);
      setPreview(md);
    } catch {
      // Fallback: build a local preview from the template
      const key = roleType as Exclude<RoleType, "Custom">;
      if (roleType !== "Custom" && key in roleTemplates) {
        setPreview(
          roleTemplates[key].sample.replace(/You are/, `${config.name} is`)
        );
      } else {
        setPreview(`# Identity\n\nName: ${config.name}\n`);
      }
    }
  }, [buildConfig, roleType]);

  // Debounced preview updates
  useEffect(() => {
    const timer = setTimeout(updatePreview, 300);
    return () => clearTimeout(timer);
  }, [updatePreview]);

  const canProceed = name.trim().length > 0;

  async function handleNext() {
    if (!canProceed) return;
    try {
      await writeSoul(preview);
      await completeStep("personality_setup");
    } catch {
      // Non-critical; we still navigate forward
    }
    navigate("/wizard/channels");
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900">
        Shape Your Agent's Personality
      </h2>
      <p className="mt-2 text-neutral-600">
        Give your assistant a name, choose a role, and fine-tune the tone.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Left column: form controls */}
        <div className="space-y-6">
          {/* Name input */}
          <div>
            <label
              htmlFor="agent-name"
              className="block text-sm font-medium text-neutral-700"
            >
              What should your assistant be called?
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Atlas, Helper, Friday"
              aria-required="true"
              aria-describedby={name.trim().length === 0 ? "agent-name-hint" : undefined}
              className="
                mt-1.5 w-full rounded-lg border border-neutral-300
                bg-neutral-50 px-3 py-2 text-sm
                placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none
                focus:ring-2 focus:ring-primary-100
              "
            />
            {name.trim().length === 0 && (
              <p className="mt-1 text-xs text-neutral-600" id="agent-name-hint">
                A name is required to continue.
              </p>
            )}
          </div>

          {/* Role selector */}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-700">
              Role
            </legend>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Select a role">
              {ROLE_OPTIONS.map((r) => {
                const isSelected = roleType === r.type;
                const Icon = r.icon;
                return (
                  <label
                    key={r.type}
                    className={`
                      flex cursor-pointer items-start gap-3 rounded-xl border
                      p-3.5 transition-all
                      ${
                        isSelected
                          ? "border-primary-400 bg-primary-50 ring-2 ring-primary-100"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.type}
                      checked={isSelected}
                      onChange={() => setRoleType(r.type)}
                      className="sr-only"
                      aria-label={r.title}
                    />
                    <div
                      className={`
                        mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                        rounded-lg
                        ${isSelected ? "bg-primary-100" : "bg-neutral-100"}
                      `}
                      aria-hidden="true"
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          isSelected ? "text-primary-600" : "text-neutral-500"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {r.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Custom role text input — shown when Custom is selected */}
            {roleType === "Custom" && (
              <div className="mt-3">
                <label
                  htmlFor="custom-role"
                  className="block text-xs font-medium text-neutral-600"
                >
                  Describe the custom role
                </label>
                <input
                  id="custom-role"
                  type="text"
                  value={customRoleText}
                  onChange={(e) => setCustomRoleText(e.target.value)}
                  placeholder="e.g., A personal finance advisor that tracks budgets"
                  className="
                    mt-1 w-full rounded-lg border border-neutral-300
                    bg-neutral-50 px-3 py-2 text-sm
                    placeholder:text-neutral-400
                    focus:border-primary-400 focus:outline-none
                    focus:ring-2 focus:ring-primary-100
                  "
                  aria-label="Custom role description"
                />
              </div>
            )}
          </fieldset>

          {/* Tone slider */}
          <ToneSlider value={tone} onChange={setTone} />

          {/* Special instructions */}
          <div>
            <label
              htmlFor="instructions"
              className="block text-sm font-medium text-neutral-700"
            >
              Any special instructions?{" "}
              <span className="text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="e.g., Always respond in bullet points, Focus on actionable advice"
              className="
                mt-1.5 w-full rounded-lg border border-neutral-300
                bg-neutral-50 px-3 py-2 text-sm
                placeholder:text-neutral-400
                focus:border-primary-400 focus:outline-none
                focus:ring-2 focus:ring-primary-100
              "
              aria-label="Special instructions for your agent"
            />
          </div>
        </div>

        {/* Right column: live SOUL.md preview */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">
            SOUL.md Preview
          </h3>
          <pre
            className="
              max-h-96 overflow-auto whitespace-pre-wrap rounded-lg
              bg-neutral-50 p-4 font-mono text-xs leading-relaxed
              text-neutral-700
            "
            aria-label="Live preview of the generated SOUL.md file"
            aria-live="polite"
          >
            {preview || "Configure your agent to see a preview..."}
          </pre>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          aria-label="Next: configure channels"
          className="
            rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold
            text-white shadow-lg shadow-primary-200 transition-all
            hover:bg-primary-700
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            disabled:cursor-not-allowed disabled:opacity-50
            disabled:shadow-none
          "
        >
          Next
        </button>
      </div>
    </div>
  );
}
