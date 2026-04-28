interface PwcMarkProps {
  size?: number;
  className?: string;
  /** "wordmark" shows pwc text + accent. "accent" shows only the parallelogram mark. */
  variant?: "wordmark" | "accent";
}

/**
 * Approximation of the PwC brand mark (not the official logo).
 * - "wordmark": heavy serif "pwc" in ink with a single offset orange parallelogram accent above/right.
 * - "accent":   just the offset-parallelogram motif used decoratively.
 * Internal use only, for this SafeMate demo.
 */
export default function PwcMark({ size = 32, className = "", variant = "wordmark" }: PwcMarkProps) {
  if (variant === "accent") {
    // Dash + slash parallelogram motif (single orange shape with ink cut-through bar).
    const w = size * 2.4;
    const h = size;
    return (
      <svg
        width={w}
        height={h}
        viewBox="0 0 96 40"
        className={className}
        aria-hidden="true"
      >
        <polygon points="0,28 52,28 64,12 12,12" fill="#E0301E" />
        <rect x="36" y="18" width="24" height="4" fill="#1E1E1E" />
        <polygon points="60,20 92,20 96,16 64,16" fill="#E0301E" />
      </svg>
    );
  }

  // wordmark
  const h = size;
  const w = size * 2.6;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 130 50"
      className={className}
      aria-label="pwc"
    >
      {/* Orange parallelogram accent */}
      <polygon points="72,4 120,4 128,14 80,14" fill="#E0301E" />
      <rect x="90" y="9" width="20" height="3.5" fill="#1E1E1E" />
      {/* Wordmark */}
      <text
        x="0"
        y="44"
        fontFamily="Georgia, Charter, 'Source Serif Pro', 'Times New Roman', serif"
        fontWeight="900"
        fontSize="44"
        fill="#1E1E1E"
        letterSpacing="-1"
      >
        pwc
      </text>
    </svg>
  );
}
