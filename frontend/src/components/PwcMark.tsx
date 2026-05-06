// PwcMark — official PwC logo asset (frontend/public/pwc-logo.svg).
// Wikimedia Commons SVG source. variant prop kept for backward compatibility
// but both variants now render the same single-asset logo.
interface PwcMarkProps {
  size?: number;
  className?: string;
  /** Kept for backward compat. Both render the official asset. */
  variant?: "wordmark" | "accent";
}

// SVG viewBox: 0.54 5.5 359.39 173.84 → aspect ratio ≈ 2.067:1
const PWC_ASPECT = 359.39 / 173.84;

export default function PwcMark({ size = 32, className = "" }: PwcMarkProps) {
  const h = size;
  const w = Math.round(size * PWC_ASPECT);
  return (
    <img
      src="/pwc-logo.svg"
      alt="PwC"
      width={w}
      height={h}
      className={className}
      style={{ display: "inline-block" }}
    />
  );
}
