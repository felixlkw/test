// Language label/flag config used by LangChip & LangDropdown.
// PR 1: App.tsx L65-71 그대로 이전. SessionLanguage 타입은 sessionModel 재사용.
// 2026-05-06 mobile fix — 좁은 폭(< 640px) 대응 short 2자리 코드 추가.
import type { SessionLanguage } from "../../services/sessionModel";

export const LANGUAGE_CONFIG: Record<
  SessionLanguage,
  { name: string; flag: string; code: string }
> = {
  english: { name: "English", flag: "🇺🇸", code: "EN" },
  korean: { name: "한국어", flag: "🇰🇷", code: "KO" },
  vietnamese: { name: "Tiếng Việt", flag: "🇻🇳", code: "VI" },
  thai: { name: "ภาษาไทย", flag: "🇹🇭", code: "TH" },
  indonesian: { name: "Bahasa Indonesia", flag: "🇮🇩", code: "ID" },
};
