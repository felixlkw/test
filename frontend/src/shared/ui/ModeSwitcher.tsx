// ModeSwitcher — App.tsx L1255-1281 이전. PR 3: sessionActive 시 disabled + 시각적 dim.
import type { AppMode } from "../../features/tbm/types";

interface ModeSwitcherProps {
  currentMode: AppMode;
  onSwitch: (mode: AppMode) => void;
  disabled?: boolean;
}

export function ModeSwitcher({ currentMode, onSwitch, disabled }: ModeSwitcherProps) {
  return (
    <div
      className={`flex bg-pwc-bg-card rounded-full p-1 border border-pwc-border ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <button
        className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 disabled:cursor-not-allowed ${
          currentMode === "TBM"
            ? "bg-pwc-orange text-white shadow-pwc-card"
            : "text-pwc-ink-soft hover:text-pwc-orange"
        }`}
        onClick={() => onSwitch("TBM")}
        disabled={disabled}
      >
        TBM
      </button>
      <button
        className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 disabled:cursor-not-allowed ${
          currentMode === "EHS"
            ? "bg-pwc-orange text-white shadow-pwc-card"
            : "text-pwc-ink-soft hover:text-pwc-orange"
        }`}
        onClick={() => onSwitch("EHS")}
        disabled={disabled}
      >
        EHS
      </button>
    </div>
  );
}
