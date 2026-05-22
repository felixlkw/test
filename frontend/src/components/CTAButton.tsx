import type { ReactNode, ButtonHTMLAttributes } from "react";
import { IconArrowRight } from "./Icon";

type Variant = "solid" | "outline" | "ghost";

interface CTAButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  arrow?: boolean;
  children: ReactNode;
}

const baseClasses =
  "inline-flex items-center justify-between gap-4 px-5 py-4 rounded-hoban text-[15px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-hoban-primary focus-visible:outline-offset-2";

// Hybrid brand: solid CTA uses ink (dark) for AAA readability on large
// action surfaces. Outline reveals brand orange on hover as accent.
const variantClasses: Record<Variant, string> = {
  solid: "bg-hoban-ink text-white hover:bg-black",
  outline:
    "bg-white text-hoban-ink border border-hoban-border-strong hover:border-hoban-primary hover:text-hoban-primary",
  ghost: "bg-transparent text-hoban-ink hover:bg-hoban-primary-wash",
};

export default function CTAButton({
  variant = "solid",
  block = false,
  arrow = true,
  children,
  className = "",
  ...rest
}: CTAButtonProps) {
  return (
    <button
      {...rest}
      className={`${baseClasses} ${variantClasses[variant]} ${block ? "w-full" : ""} ${className}`}
    >
      <span className="text-left">{children}</span>
      {arrow && (
        <span className="shrink-0" aria-hidden="true">
          <IconArrowRight size={20} />
        </span>
      )}
    </button>
  );
}
