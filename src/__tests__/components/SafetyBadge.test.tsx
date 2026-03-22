/**
 * Tests for the SafetyBadge component.
 *
 * SafetyBadge displays a visual rating (icon + text) for ClawHub skill
 * safety scores using role="status" and SafetyRating values:
 * "Verified", "Community", "Unreviewed".
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SafetyBadge } from "@/components/SafetyBadge";
import type { SafetyRating } from "@/lib/types";

const ratings: SafetyRating[] = ["Verified", "Community", "Unreviewed"];

describe("SafetyBadge", () => {
  it.each(ratings)("renders visible label text for rating: %s", (rating) => {
    render(<SafetyBadge rating={rating} />);
    expect(screen.getByText(rating)).toBeInTheDocument();
  });

  it.each(ratings)("uses role='status' with an aria-label for: %s", (rating) => {
    render(<SafetyBadge rating={rating} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("aria-label", `Safety rating: ${rating}`);
  });

  it("renders different styling classes per rating", () => {
    const { rerender } = render(<SafetyBadge rating="Verified" />);
    const verified = screen.getByRole("status");
    expect(verified.className).toContain("success");

    rerender(<SafetyBadge rating="Unreviewed" />);
    const unreviewed = screen.getByRole("status");
    expect(unreviewed.className).toContain("neutral");
  });
});
