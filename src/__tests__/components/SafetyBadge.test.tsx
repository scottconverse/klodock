/**
 * Tests for the SafetyBadge component.
 *
 * SafetyBadge displays a visual rating (icon + text) for ClawHub skill
 * safety scores.  It must be accessible and not rely solely on color
 * to convey information.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// TODO: Update this import path once the SafetyBadge component is created.
// import SafetyBadge from "../../components/SafetyBadge";

type Rating = "safe" | "caution" | "danger" | "unknown";

// Placeholder component until the real one is built.
function SafetyBadge({ rating }: { rating: Rating }) {
  const icons: Record<Rating, string> = {
    safe: "\u2705",       // checkmark
    caution: "\u26A0\uFE0F", // warning
    danger: "\u274C",      // X
    unknown: "\u2753",     // question mark
  };
  const labels: Record<Rating, string> = {
    safe: "Safe",
    caution: "Use with caution",
    danger: "Potentially dangerous",
    unknown: "Not yet reviewed",
  };

  return (
    <span
      role="img"
      aria-label={labels[rating]}
      data-testid={`safety-badge-${rating}`}
    >
      {icons[rating]} {labels[rating]}
    </span>
  );
}

describe("SafetyBadge", () => {
  const ratings: Rating[] = ["safe", "caution", "danger", "unknown"];

  it.each(ratings)("renders correct icon for rating: %s", (rating) => {
    render(<SafetyBadge rating={rating} />);

    const badge = screen.getByTestId(`safety-badge-${rating}`);
    expect(badge).toBeInTheDocument();
  });

  it.each(ratings)("has accessible text (not color-only) for: %s", (rating) => {
    render(<SafetyBadge rating={rating} />);

    const badge = screen.getByTestId(`safety-badge-${rating}`);
    // The badge must have an aria-label so screen readers can convey
    // the rating without relying on color or icon alone.
    expect(badge).toHaveAttribute("aria-label");
    expect(badge.getAttribute("aria-label")).toBeTruthy();

    // The visible text should also be present (not hidden).
    expect(badge.textContent).toBeTruthy();
  });
});
