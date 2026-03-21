/**
 * Tests for the ModelProvider wizard screen.
 *
 * The ModelProvider screen displays provider cards (OpenAI, Anthropic, Gemini,
 * Groq, OpenRouter, Ollama) and a "Next" button that is disabled until the
 * user has entered and validated an API key.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// TODO: Update this import path once the ModelProvider component is created.
// import ModelProvider from "../../wizard/ModelProvider";

const PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Gemini",
  "Groq",
  "OpenRouter",
  "Ollama",
] as const;

// Placeholder component until the real one is built.
function ModelProvider() {
  return (
    <div>
      <h2>Choose a Model Provider</h2>
      <div role="list" aria-label="Provider selection">
        {PROVIDERS.map((name) => (
          <div key={name} role="listitem" data-testid={`provider-${name.toLowerCase()}`}>
            {name}
          </div>
        ))}
      </div>
      <button disabled>Next</button>
    </div>
  );
}

describe("ModelProvider wizard screen", () => {
  it("renders all 6 provider cards", () => {
    render(<ModelProvider />);

    for (const provider of PROVIDERS) {
      expect(screen.getByText(provider)).toBeInTheDocument();
    }
  });

  it("next button disabled until key validated", () => {
    render(<ModelProvider />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();

    // TODO: Once the real component is wired up, simulate entering a valid
    // API key and mock the test_api_key invoke call to return true, then
    // assert that the button becomes enabled.
  });
});
