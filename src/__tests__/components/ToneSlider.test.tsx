/**
 * Tests for the ToneSlider component.
 *
 * ToneSlider uses a float range 0-1 externally. Internally the <input>
 * maps to 0-100 integers. Labels: Formal, Slightly formal, Balanced,
 * Slightly casual, Casual.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ToneSlider } from "@/components/ToneSlider";

describe("ToneSlider", () => {
  it("renders with the correct internal value (float * 100)", () => {
    render(<ToneSlider value={0.5} onChange={() => {}} />);
    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("calls onChange with a float 0-1 value", () => {
    const handleChange = vi.fn();
    render(<ToneSlider value={0.5} onChange={handleChange} />);
    const slider = screen.getByRole("slider", { name: /tone/i });
    fireEvent.change(slider, { target: { value: "75" } });
    expect(handleChange).toHaveBeenCalledWith(0.75);
  });

  it("displays 'Formal' label when value < 0.3", () => {
    render(<ToneSlider value={0.1} onChange={() => {}} />);
    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toHaveAttribute("aria-valuetext", "Formal");
  });

  it("displays 'Balanced' label when value is 0.5", () => {
    render(<ToneSlider value={0.5} onChange={() => {}} />);
    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toHaveAttribute("aria-valuetext", "Balanced");
  });

  it("displays 'Casual' label when value >= 0.9", () => {
    render(<ToneSlider value={0.95} onChange={() => {}} />);
    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toHaveAttribute("aria-valuetext", "Casual");
  });
});
