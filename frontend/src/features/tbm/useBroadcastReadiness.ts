// useBroadcastReadiness — Phase 2.x PR-4. felix Q4=A 권장 (구체 카운터).
// derived state (영속 X — invariant #10). useMemo로 매 렌더 재계산.
//
// 종료 게이트 4 조건:
//   1) baseline checklist (is_baseline=true) 100% completed.
//   2) structured.hazards / risk_scenarios / mitigations / ppe 4필드 모두 값 존재.
//   3) attendance_confirmed === true.
//
// 4 조건 모두 만족 시 isReady=true → BroadcastCompleteCTA 활성화.
// 어느 하나라도 미충족이면 누락 항목을 구체적으로 카운트해 사용자에게 노출.
//
// legacy 세션 (baseline 0건) 처리:
//   - missingChecklistCount = 0 (baseline 항목 자체가 없으니 100% 자동 충족).
//   - structured 4필드 + attendance만 검사 → 사용자가 수동 입력으로 활성화 가능.
//   - felix 미해결 결정 §10 — N/A. 의도된 동작.
import { useMemo } from "react";
import type { ChecklistItem } from "../../services/checklist";
import type { StructuredChecklist } from "../../services/sessionModel";

export interface BroadcastReadinessState {
  /** 4 종료 게이트 모두 충족 시 true. */
  isReady: boolean;
  /** baseline=true 항목 중 미완료 개수. baseline 0건이면 0. */
  missingChecklistCount: number;
  /** 비어있는 필수 필드 라벨(한글). 사용자 노출용. */
  missingStructuredFields: string[];
  /** attendance_confirmed !== true 일 때 true. */
  missingAttendance: boolean;
  /** 누락 합계. UI가 단일 값으로 보여줄 때 사용. */
  totalMissing: number;
}

/** 사용자 노출 라벨 — felix Q4=A 권장(구체 카운터). */
const REQUIRED_STRUCTURED_FIELDS: ReadonlyArray<{
  key: keyof StructuredChecklist;
  label: string;
}> = [
  { key: "hazards", label: "주요 위험요인" },
  { key: "risk_scenarios", label: "위험 시나리오" },
  { key: "mitigations", label: "대응/예방" },
  { key: "ppe", label: "보호구" },
];

export function useBroadcastReadiness(
  checklist: ChecklistItem[],
  structured: StructuredChecklist,
): BroadcastReadinessState {
  return useMemo<BroadcastReadinessState>(() => {
    // 1) baseline checklist 100% — baseline 0건이면 자동 충족.
    const baselineItems = checklist.filter((c) => c.is_baseline === true);
    const missingChecklistCount = baselineItems.filter(
      (c) => !c.completed,
    ).length;

    // 2) structured 4 필수 필드 비어있음 검사.
    const missingStructuredFields: string[] = [];
    for (const f of REQUIRED_STRUCTURED_FIELDS) {
      const v = structured[f.key];
      if (Array.isArray(v)) {
        if (v.length === 0) missingStructuredFields.push(f.label);
      } else if (v === undefined || v === null) {
        missingStructuredFields.push(f.label);
      } else if (typeof v === "string" && v.trim().length === 0) {
        missingStructuredFields.push(f.label);
      }
    }

    // 3) attendance_confirmed.
    const missingAttendance = structured.attendance_confirmed !== true;

    const totalMissing =
      missingChecklistCount +
      missingStructuredFields.length +
      (missingAttendance ? 1 : 0);

    return {
      isReady: totalMissing === 0,
      missingChecklistCount,
      missingStructuredFields,
      missingAttendance,
      totalMissing,
    };
  }, [checklist, structured]);
}
