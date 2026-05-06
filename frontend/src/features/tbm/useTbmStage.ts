// useTbmStage — PR B (c6 §3.VII).
// TBM 진행 단계를 매 렌더 derive 한다. 영속 X (invariant #10).
//
// 4 단계: prior_info → checklist → mitigations → finalize.
// derive 우선순위(역순으로 검사):
//   1. final_summary 채워졌으면 → "finalize"
//   2. structured.mitigations >= 1 + checklist 절반 이상 완료 → "mitigations"
//   3. checklist_items.length >= 1 → "checklist"
//   4. 그 외 → "prior_info"
//
// 자동 전환은 LLM의 update_session_field / complete_checklist_item / finalize_tbm
// 툴 호출 시점에 frontend가 derive — "다음 단계" 버튼 X (c6 §8.2 chat-first 일관성).
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
