import { useNavigate } from "react-router-dom";
import { Sparkles, Shield, Zap } from "lucide-react";

export function Welcome() {
  const navigate = useNavigate();

  function handleStart() {
    navigate("/wizard/dependencies");
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100"
        aria-hidden="true"
      >
        <Sparkles className="h-8 w-8 text-primary-600" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
        Welcome to ClawPad
      </h1>

      <p className="mt-3 max-w-md text-lg leading-relaxed text-neutral-600">
        Let's set up your AI assistant. It only takes a few minutes.
      </p>

      <ul className="mt-10 grid w-full max-w-lg gap-4 text-left">
        <li className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50">
            <Zap className="h-5 w-5 text-primary-500" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">
              Quick &amp; easy setup
            </p>
            <p className="mt-0.5 text-sm text-neutral-500">
              A guided wizard handles all the technical details for you.
            </p>
          </div>
        </li>

        <li className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-50">
            <Shield
              className="h-5 w-5 text-success-500"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">
              Your keys stay local
            </p>
            <p className="mt-0.5 text-sm text-neutral-500">
              API keys are encrypted and never leave your machine.
            </p>
          </div>
        </li>

        <li className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-50">
            <Sparkles
              className="h-5 w-5 text-warning-500"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="font-semibold text-neutral-900">
              Fully customizable
            </p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Choose your AI provider, personality, channels, and skills.
            </p>
          </div>
        </li>
      </ul>

      <button
        type="button"
        onClick={handleStart}
        className="
          mt-10 rounded-xl bg-primary-600 px-8 py-3.5 text-base
          font-semibold text-white shadow-lg shadow-primary-200
          transition-all hover:bg-primary-700 hover:shadow-xl
          hover:shadow-primary-200
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-primary-500
        "
        aria-label="Get started with setup"
      >
        Get Started
      </button>
    </div>
  );
}
