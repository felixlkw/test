// HobanMark — brand wordmark. Filename retained for backward compat with
// imports across screens; renders the official Hoban Group logo.
interface PwcMarkProps {
  size?: number;
  className?: string;
  /** Kept for backward compat; both render the official asset. */
  variant?: "wordmark" | "accent";
}

// hoban-logo.svg viewBox: 0 0 841.9 144.5 → aspect ratio ≈ 5.825:1 (wide wordmark)
const BRAND_ASPECT = 841.9 / 144.5;

export default function PwcMark({ size = 32, className = "" }: PwcMarkProps) {
  const h = size;
  const w = Math.round(size * BRAND_ASPECT);
  return (
    <img
      src="/hoban-logo.svg"
      alt="Hoban"
      width={w}
      height={h}
      className={className}
      style={{ display: "inline-block" }}
    />
  );
}
