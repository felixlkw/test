// useStructuredProgress — Readiness 기반 가중치 진행률.
//
// 변경(2026-05-18): 8필드 단순 카운터 → useBroadcastReadiness 3 게이트와 정합한
// 가중치 합산. 시작값 ~63% (prefill 5/8) → ~30% (체크리스트 0 + structured 30 +
// attendance 0)로 정상화. Attestation 완료 시 100% 보장.
//
//   체크리스트(baseline) 완료율 × 50 +
//   structured 4필수필드(hazards/risk_scenarios/mitigations/ppe) 충족율 × 30 +
//   attendance_confirmed(boolean) × 20 = 0~100
//
// baseline 0건(legacy)이면 체크리스트는 자동 충족(useBroadcastReadiness와 동일).
import { useMemo } from "react";
import type { ChecklistItem } from "../../services/checklist";
import type { StructuredChecklist } from "../../services/sessionModel";

export interface UseStructuredProgressResult {
  structuredFilledCount: number;
  structuredProgressPercent: number;
}

const WEIGHT_CHECKLIST = 50;
const WEIGHT_STRUCTURED = 30;
const WEIGHT_ATTENDANCE = 20;

const REQUIRED_STRUCTURED_FIELDS: Array<keyof StructuredChecklist> = [
  "hazards",
  "risk_scenarios",
  "mitigations",
  "ppe",
];

function isFieldFilled(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return v;
  return false;
}

export function useStructuredProgress(
  checklist: ChecklistItem[],
  structured: StructuredChecklist,
): UseStructuredProgressResult {
  return useMemo(() => {
    const baselineItems = checklist.filter((c) => c.is_baseline === true);
    const checklistRatio =
      baselineItems.length === 0
        ? 1
        : baselineItems.filter((c) => c.completed).length / baselineItems.length;

    const filledRequired = REQUIRED_STRUCTURED_FIELDS.filter((k) =>
      isFieldFilled(structured[k]),
    ).length;
    const structuredRatio = filledRequired / REQUIRED_STRUCTURED_FIELDS.length;

    const attendanceRatio = structured.attendance_confirmed === true ? 1 : 0;

    const score =
      checklistRatio * WEIGHT_CHECKLIST +
      structuredRatio * WEIGHT_STRUCTURED +
      attendanceRatio * WEIGHT_ATTENDANCE;

    return {
      structuredFilledCount: filledRequired,
      structuredProgressPercent: Math.round(score),
    };
  }, [checklist, structured]);
}
