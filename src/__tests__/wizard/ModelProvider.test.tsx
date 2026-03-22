/**
 * Tests for the ModelProvider wizard screen.
 *
 * The ModelProvider screen displays 6 provider cards in a CSS grid
 * (OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Ollama) and a
 * "Next" button disabled until a provider is validated.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { ModelProvider } from "@/wizard/ModelProvider";

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <ModelProvider />
    </MemoryRouter>
  );
}

describe("ModelProvider wizard screen", () => {
  it("renders all 6 provider names", () => {
    // Mock checkOllama (auto-called by ProviderCard for local provider)
    vi.mocked(invoke).mockResolvedValue(false);

    renderWithRouter();

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Google Gemini")).toBeInTheDocument();
    expect(screen.getByText("Groq")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("Ollama (Local)")).toBeInTheDocument();
  });

  it("renders the heading", () => {
    vi.mocked(invoke).mockResolvedValue(false);
    renderWithRouter();

    expect(
      screen.getByRole("heading", { name: /connect an ai provider/i })
    ).toBeInTheDocument();
  });

  it("Next button is disabled when no provider is validated", () => {
    vi.mocked(invoke).mockResolvedValue(false);
    renderWithRouter();

    const nextButton = screen.getByRole("button", { name: /continue to personality/i });
    expect(nextButton).toBeDisabled();
  });

  it("shows helper text prompting user to connect a provider", () => {
    vi.mocked(invoke).mockResolvedValue(false);
    renderWithRouter();

    expect(
      screen.getByText(/connect at least one provider to continue/i)
    ).toBeInTheDocument();
  });
});
