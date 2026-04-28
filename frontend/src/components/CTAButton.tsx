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
  "inline-flex items-center justify-between gap-4 px-5 py-4 rounded-pwc text-[15px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-pwc-orange focus-visible:outline-offset-2";

const variantClasses: Record<Variant, string> = {
  solid: "bg-pwc-orange text-white hover:bg-pwc-orange-deep",
  outline:
    "bg-white text-pwc-ink border border-pwc-border-strong hover:border-pwc-orange hover:text-pwc-orange",
  ghost: "bg-transparent text-pwc-ink hover:bg-pwc-orange-wash",
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
