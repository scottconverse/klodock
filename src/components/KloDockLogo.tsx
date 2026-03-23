/**
 * KloDock "K" monogram logo.
 * Rounded-square container with a stylized K letterform.
 * Used in sidebar, wizard, and landing page.
 */
export function KloDockLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Rounded square background */}
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      {/* Stylized K letterform */}
      <path
        d="M10 7v18M10 16l9-9M10 16l9 9"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dock dot accent */}
      <circle cx="23" cy="16" r="2.5" fill="white" opacity="0.7" />
    </svg>
  );
}

/**
 * Inline SVG string for use in static HTML (landing page, etc.)
 * Copy this into the HTML where needed.
 */
export const KLODOCK_LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M10 7v18M10 16l9-9M10 16l9 9" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="16" r="2.5" fill="white" opacity="0.7"/></svg>`;
