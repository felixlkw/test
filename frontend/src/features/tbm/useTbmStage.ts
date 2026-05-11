// useTbmStage — PR B (c6 §3.VII) + PR-feedback-3 (v0.2.3) 5단계 확장.
// TBM 진행 단계를 매 렌더 derive 한다. 영속 X (invariant #10).
//
// 4 단계 (legacy, StagesStrip이 사용): prior_info → checklist → mitigations → finalize.
// derive 우선순위(역순으로 검사):
//   1. final_summary 채워졌으면 → "finalize"
//   2. structured.mitigations >= 1 + checklist 절반 이상 완료 → "mitigations"
//   3. checklist_items.length >= 1 → "checklist"
//   4. 그 외 → "prior_info"
//
// 자동 전환은 LLM의 update_session_field / complete_checklist_item / finalize_tbm
// 툴 호출 시점에 frontend가 derive — "다음 단계" 버튼 X (c6 §8.2 chat-first 일관성).
//
// PR-feedback-3 5단계 (started → confirming → in_progress → finishing → completed):
//   본 PR은 stepper UI(StagesStrip)는 4단계 어휘를 유지(시각적 회귀 0). 5단계는
//   slot 채움 / 종료 임박 환기 / sticky 배너 등 비-stepper UX에서만 사용. 따라서
//   기존 deriveTbmStage / TbmStage export는 무수정. 5단계용 derive는 별도 함수.
//
//   매핑:
//     started     ← messages 1건 이하 + checklist 비어있음
//     confirming  ← prior_info 슬롯 1건 이상 채움 + checklist 비어있음
//     in_progress ← checklist 1건 이상 (skipped 포함)
//     finishing   ← closingDetector 트리거 충족 (외부 신호) — derive 입력으로 받음
//     completed   ← final_summary 채워짐
//
//   "started → confirming → in_progress" 사이의 slot 채움은 단계 무관하게 계속.
//   stage label은 진행률에 따라 바뀌지만 슬롯 inject는 단계 분기 X.
import type { ChecklistItem } from "../../services/checklist";
import type { StructuredChecklist } from "../../services/sessionModel";

export type TbmStage = "prior_info" | "checklist" | "mitigations" | "finalize";

export function deriveTbmStage(
  structured: StructuredChecklist,
  checklist: ChecklistItem[],
  finalSummary: string,
): TbmStage {
  // finalize: final_summary 비어있지 않음 — finalize_tbm 호출 후.
  if (finalSummary && finalSummary.trim().length > 0) return "finalize";

  // mitigations: structured.mitigations 1건 이상 + checklist 절반 이상 완료.
  // mitigations만 있고 checklist 미완성이면 아직 checklist 단계로 본다 — 사용자가
  // mitigations를 먼저 자발적으로 말한 케이스(Cycle 4 free-flow)에서 stepper가
  // 갑자기 점프하는 걸 방지.
  const completedCount = checklist.filter((c) => c.completed).length;
  const halfDone =
    checklist.length > 0 &&
    completedCount >= Math.ceil(checklist.length / 2);
  const mitigationsCount = Array.isArray(structured.mitigations)
    ? structured.mitigations.length
    : 0;
  if (mitigationsCount > 0 && halfDone) return "mitigations";

  // checklist: 항목 1건 이상 존재 — create_dynamic_checklist 호출 후.
  if (checklist.length > 0) return "checklist";

  // 기본: prior_info 단계.
  return "prior_info";
}

// ── PR-feedback-3 (v0.2.3) — 5단계 ─────────────────────────────────────
export type TbmStage5 =
  | "started"
  | "confirming"
  | "in_progress"
  | "finishing"
  | "completed";

/**
 * 5단계 derive. finishingActive는 closingDetector OR 트리거 충족 시 외부에서
 * true로 주입(VoiceShell의 useRef 가드). final_summary 채워지면 completed 우선.
 *
 * stage label은 slot 채움과 무관 — 단계 점프해도 slot 채움은 계속.
 */
export function deriveTbmStage5(args: {
  structured: StructuredChecklist;
  checklist: ChecklistItem[];
  finalSummary: string;
  /** Slot 채움(filled) 카운트 — 0..4. */
  filledSlotCount: number;
  /** closingDetector가 트리거 충족 시 true (VoiceShell이 ref로 1회 set). */
  finishingActive: boolean;
}): TbmStage5 {
  // completed: final_summary 채워짐(finalize_tbm 호출 후).
  if (args.finalSummary && args.finalSummary.trim().length > 0) {
    return "completed";
  }
  // finishing: closingDetector 트리거 충족.
  if (args.finishingActive) return "finishing";

  // in_progress: checklist 1건 이상 (skipped 포함).
  if (args.checklist.length >= 1) return "in_progress";

  // confirming: slot 1건 이상 채움.
  if (args.filledSlotCount >= 1) return "confirming";

  // started: 시작 직후 / 아무 입력 없음.
  return "started";
}
