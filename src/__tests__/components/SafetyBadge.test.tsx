/**
 * Tests for the SafetyBadge component.
 *
 * SafetyBadge displays a status badge (icon + text) for skill distribution
 * status using role="status". Badges indicate where a skill comes from,
 * not whether it has been security-audited.
 *
 * New names: "Bundled", "Published", "Unlisted"
 * Legacy names ("Verified", "Community", "Unreviewed") map to new names.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SafetyBadge } from "@/components/SafetyBadge";
import type { SafetyRating } from "@/lib/types";

describe("SafetyBadge", () => {
  // New badge names
  const newRatings: { rating: SafetyRating; label: string }[] = [
    { rating: "Bundled", label: "Bundled" },
    { rating: "Published", label: "Published" },
    { rating: "Unlisted", label: "Unlisted" },
  ];

  it.each(newRatings)("renders label '$label' for rating '$rating'", ({ rating, label }) => {
    render(<SafetyBadge rating={rating} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(newRatings)("uses role='status' with aria-label for '$rating'", ({ rating, label }) => {
    render(<SafetyBadge rating={rating} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("aria-label", `Skill status: ${label}`);
  });

  // Legacy badge names map to new names
  const legacyMappings: { rating: SafetyRating; expectedLabel: string }[] = [
    { rating: "Verified", expectedLabel: "Bundled" },
    { rating: "Community", expectedLabel: "Published" },
    { rating: "Unreviewed", expectedLabel: "Unlisted" },
  ];

  it.each(legacyMappings)("maps legacy '$rating' to '$expectedLabel'", ({ rating, expectedLabel }) => {
    render(<SafetyBadge rating={rating} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it("renders different styling classes per rating", () => {
    const { rerender } = render(<SafetyBadge rating="Bundled" />);
    const bundled = screen.getByRole("status");
    expect(bundled.className).toContain("success");

    rerender(<SafetyBadge rating="Unlisted" />);
    const unlisted = screen.getByRole("status");
    expect(unlisted.className).toContain("neutral");
  });

  it("shows tooltip with honest description", () => {
    render(<SafetyBadge rating="Bundled" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("title");
    expect(badge.getAttribute("title")).toContain("Not independently audited");
  });
});
