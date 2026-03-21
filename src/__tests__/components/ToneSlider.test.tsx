/**
 * Tests for the ToneSlider component.
 *
 * ToneSlider is a range input that lets users control the assistant's
 * communication style on a spectrum (e.g., formal to casual).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// TODO: Update this import path once the ToneSlider component is created.
// import ToneSlider from "../../components/ToneSlider";

// Placeholder component until the real one is built.
function ToneSlider({
  value = 50,
  onChange,
}: {
  value?: number;
  onChange?: (value: number) => void;
}) {
  const toneLabel = (v: number) => {
    if (v < 25) return "Formal";
    if (v < 50) return "Professional";
    if (v < 75) return "Friendly";
    return "Casual";
  };

  const [current, setCurrent] = React.useState(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    setCurrent(newVal);
    onChange?.(newVal);
  };

  return (
    <label>
      Tone
      <input
        type="range"
        min="0"
        max="100"
        value={current}
        onChange={handleChange}
        aria-label="Tone"
        aria-valuetext={toneLabel(current)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={current}
      />
    </label>
  );
}

describe("ToneSlider", () => {
  it("renders with default value", () => {
    render(<ToneSlider />);

    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("fires onChange on interaction", () => {
    const handleChange = vi.fn();
    render(<ToneSlider onChange={handleChange} />);

    const slider = screen.getByRole("slider", { name: /tone/i });
    fireEvent.change(slider, { target: { value: "75" } });

    expect(handleChange).toHaveBeenCalledWith(75);
  });

  it("has aria-valuetext", () => {
    render(<ToneSlider value={10} />);

    const slider = screen.getByRole("slider", { name: /tone/i });
    expect(slider).toHaveAttribute("aria-valuetext");
    // At value 10, the tone label should be "Formal".
    expect(slider.getAttribute("aria-valuetext")).toBe("Formal");
  });
});
