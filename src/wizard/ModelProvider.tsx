import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  Sparkles,
  Globe,
  Zap,
  Router,
  Server,
} from "lucide-react";
import { ProviderCard } from "@/components/ProviderCard";
import { completeStep } from "@/lib/tauri";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    cost: "~$5-20/mo",
    envVar: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    icon: <Brain className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    cost: "~$5-20/mo",
    envVar: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    icon: <Sparkles className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    cost: "Free tier available",
    envVar: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    icon: <Globe className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "groq",
    name: "Groq",
    cost: "Free tier available",
    envVar: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    icon: <Zap className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    cost: "Pay per use",
    envVar: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    icon: <Router className="h-5 w-5 text-primary-500" />,
    isLocal: false,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    cost: "Free — runs on your computer",
    envVar: null,
    keyUrl: "https://ollama.com/download",
    icon: <Server className="h-5 w-5 text-primary-500" />,
    isLocal: true,
  },
] as const;

export function ModelProvider() {
  const navigate = useNavigate();
  const [validated, setValidated] = useState<Set<string>>(new Set());

  function handleValidated(providerId: string) {
    setValidated((prev) => new Set([...prev, providerId]));
  }

  async function handleNext() {
    try {
      await completeStep("api_key_setup");
    } catch {
      // Non-critical — continue anyway
    }
    navigate("/wizard/personality");
  }

  const hasValidProvider = validated.size > 0;

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900">
        Connect an AI Provider
      </h2>
      <p className="mt-2 text-neutral-600">
        Your agent needs at least one AI provider to think. Pick one or more
        below, paste your API key, and test the connection.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            id={p.id}
            name={p.name}
            cost={p.cost}
            envVar={p.envVar}
            keyUrl={p.keyUrl}
            icon={p.icon}
            isLocal={p.isLocal}
            validated={validated.has(p.id)}
            onValidated={handleValidated}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {hasValidProvider
            ? `${validated.size} provider${validated.size > 1 ? "s" : ""} connected`
            : "Connect at least one provider to continue"}
        </p>
        <button
          type="button"
          onClick={handleNext}
          disabled={!hasValidProvider}
          className="
            rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold
            text-white shadow-lg shadow-primary-200 transition-all
            hover:bg-primary-700
            focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-primary-500
            disabled:cursor-not-allowed disabled:opacity-50
            disabled:shadow-none
          "
          aria-label="Continue to personality setup"
        >
          Next
        </button>
      </div>
    </div>
  );
}
