// LangChip — App.tsx L1282-1294 (드롭다운 트리거) 이전.
import type { SessionLanguage } from "../../services/sessionModel";
import { LANGUAGE_CONFIG } from "../i18n/languageConfig";

interface LangChipProps {
  currentLanguage: SessionLanguage;
  onClick: () => void;
  disabled?: boolean;
}

export function LangChip({ currentLanguage, onClick, disabled }: LangChipProps) {
  const cfg = LANGUAGE_CONFIG[currentLanguage];
  return (
    <button
      className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-pwc-bg-card rounded-full border border-pwc-border text-pwc-ink-soft hover:text-pwc-orange transition-colors text-xs whitespace-nowrap"
      onClick={onClick}
      disabled={disabled}
      aria-label={`언어 선택 (현재 ${cfg.name})`}
    >
      <span aria-hidden="true">{cfg.flag}</span>
      {/* 2026-05-06 mobile fix — 좁은 폭은 코드(KO), 데스크톱은 풀네임. */}
      <span className="sm:hidden font-semibold tracking-wider">{cfg.code}</span>
      <span className="hidden sm:inline">{cfg.name}</span>
      <svg
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}
