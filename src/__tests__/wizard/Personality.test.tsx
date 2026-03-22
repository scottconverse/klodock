/**
 * Tests for the Personality wizard screen.
 *
 * The Personality screen lets the user pick a role (GeneralAssistant,
 * ResearchHelper, WritingPartner, ProductivityBot, Custom), adjust a
 * ToneSlider (float 0-1), enter a name, and calls generateSoul /
 * completeStep / writeSoul via Tauri IPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Personality } from "@/wizard/Personality";

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <Personality />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  // Default: generateSoul returns a preview string
  vi.mocked(invoke).mockResolvedValue("# SOUL.md preview");
});

describe("Personality wizard screen", () => {
  it("renders all 5 role options", () => {
    renderWithRouter();

    expect(screen.getByText("General Assistant")).toBeInTheDocument();
    expect(screen.getByText("Research Helper")).toBeInTheDocument();
    expect(screen.getByText("Writing Partner")).toBeInTheDocument();
    expect(screen.getByText("Productivity Bot")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("Next button is disabled when name is empty", () => {
    renderWithRouter();

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it("Next button is enabled after entering a name", async () => {
    renderWithRouter();

    const nameInput = screen.getByLabelText(/what should your assistant be called/i);
    fireEvent.change(nameInput, { target: { value: "Atlas" } });

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeEnabled();
  });

  it("shows the tone slider with a role='slider'", () => {
    renderWithRouter();

    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toBeInTheDocument();
  });

  it("shows custom role input when Custom is selected", async () => {
    renderWithRouter();

    // Click the Custom radio
    const customRadio = screen.getByRole("radio", { name: "Custom" });
    fireEvent.click(customRadio);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/custom role description/i)
      ).toBeInTheDocument();
    });
  });
});
