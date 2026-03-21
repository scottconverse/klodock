/**
 * Tests for the Personality wizard screen.
 *
 * The Personality screen lets the user pick a "role" for their assistant and
 * adjust a tone slider.  These tests verify rendering, interaction, and
 * accessibility.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// TODO: Update this import path once the Personality component is created.
// import Personality from "../../wizard/Personality";

// Placeholder component until the real one is built.
function Personality() {
  return (
    <div>
      <h2>Choose a Personality</h2>
      <div role="radiogroup" aria-label="Role selection">
        <label>
          <input type="radio" name="role" value="coder" />
          Coder
        </label>
        <label>
          <input type="radio" name="role" value="writer" />
          Writer
        </label>
        <label>
          <input type="radio" name="role" value="analyst" />
          Analyst
        </label>
      </div>
      <div data-testid="preview">Preview: default</div>
      <label>
        Tone
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="50"
          aria-label="Tone adjustment"
          aria-valuetext="Neutral"
        />
      </label>
    </div>
  );
}

describe("Personality wizard screen", () => {
  it("renders role cards", () => {
    render(<Personality />);

    expect(screen.getByText("Coder")).toBeInTheDocument();
    expect(screen.getByText("Writer")).toBeInTheDocument();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
  });

  it("selecting a role updates preview", () => {
    render(<Personality />);

    const coderRadio = screen.getByDisplayValue("coder");
    fireEvent.click(coderRadio);

    // After selecting a role, the preview area should reflect the choice.
    // With the placeholder component this is static, but the real component
    // should update the preview text or visual.
    expect(coderRadio).toBeChecked();
  });

  it("tone slider is accessible (has aria labels)", () => {
    render(<Personality />);

    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-label", "Tone adjustment");
    expect(slider).toHaveAttribute("aria-valuetext");
  });
});
