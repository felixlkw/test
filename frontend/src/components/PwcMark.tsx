// PwcMark — brand wordmark asset. Component name retained for backward
// compatibility (referenced across screens); asset is the active brand logo.
interface PwcMarkProps {
  size?: number;
  className?: string;
  /** Kept for backward compat. Both render the official asset. */
  variant?: "wordmark" | "accent";
}

// SVG viewBox: 0 0 420.271 77.241 → aspect ratio ≈ 5.441:1 (wide wordmark)
const BRAND_ASPECT = 420.271 / 77.241;

export default function PwcMark({ size = 32, className = "" }: PwcMarkProps) {
  const h = size;
  const w = Math.round(size * BRAND_ASPECT);
  return (
    <img
      src="/LG_Innotek_logo_(english).svg"
      alt="LG Innotek"
      width={w}
      height={h}
      className={className}
      style={{ display: "inline-block" }}
    />
  );
}
