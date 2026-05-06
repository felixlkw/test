// useStructuredProgress — App.tsx L367-385 이전.
import { useMemo } from "react";
import type { StructuredChecklist } from "../../services/sessionModel";

export interface UseStructuredProgressResult {
  structuredFilledCount: number;
  structuredProgressPercent: number;
}

const STRUCTURED_FIELDS: Array<keyof StructuredChecklist> = [
  "work_summary",
  "changes_today",
  "hazards",
  "risk_scenarios",
  "mitigations",
  "ppe",
  "special_notes",
  "attendance_confirmed",
];

export function useStructuredProgress(
  structured: StructuredChecklist,
): UseStructuredProgressResult {
  return useMemo(() => {
    const structuredFilledCount = STRUCTURED_FIELDS.reduce<number>((acc, key) => {
      const v = structured[key];
      if (typeof v === "string") return acc + (v.trim().length > 0 ? 1 : 0);
      if (Array.isArray(v)) return acc + (v.length > 0 ? 1 : 0);
      if (typeof v === "boolean") return acc + (v ? 1 : 0);
      return acc;
    }, 0);
    const structuredProgressPercent = Math.round(
      (structuredFilledCount / STRUCTURED_FIELDS.length) * 100,
    );
    return { structuredFilledCount, structuredProgressPercent };
  }, [structured]);
}
