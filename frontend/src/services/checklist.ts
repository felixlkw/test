// Checklist items and types shared with backend

export interface ChecklistItem {
  index: number; // 1-based index
  content: string;
  completed?: boolean;
  utterance?: string;
  checkedAt?: string; // Timestamp when checked
  // PR A 보강 — Prepare 단계 baseline 항목 식별용. invariant #7(옵셔널 + 기본값) 준수.
  // - is_baseline=true 인 항목은 ChecklistPanel에서 자물쇠 + "필수" 칩 노출.
  // - dynamic checklist 생성 시 baseline은 보존되어야 함(useWebRTCEvents 참조).
  is_baseline?: boolean;
  baseline_id?: string;   // 카탈로그 ID (예: "WAH-01")
  regulation?: string;    // 법규/근거 (예: "산안법 §42")
  // PR-feedback-3 (v0.2.3) — 사용자가 "다음에/건너뛸게" 응답 시 LLM이
  // complete_checklist_item({skipped: true})로 호출. completed=false + skipped=true
  // 조합으로 "건너뜀" 상태를 표현 (감사 무결성: "안 한 걸 했다고 거짓 기록"이 아닌
  // 명시 skip 기록).
  // 옵셔널 필드라 IndexedDB 스키마 변경 X (v2 호환). 기존 v0.2.2 세션 hydrate 시
  // undefined → !skipped 가 기존 incomplete 판정과 동일.
  skipped?: boolean;
}

// Create checklist items from an array of strings
export function createChecklistItems(items: string[]): ChecklistItem[] {
  return items.map((content, i) => ({
    index: i + 1,
    content,
    completed: false,
  }));
}

// PR A 보강: PrepareScreen baseline 추천을 ChecklistItem 형태로 prefill.
// `regulation`은 카탈로그에서 옵셔널이라 그대로 옵셔널 유지.
export function createBaselineChecklistItems(
  baseline: { id: string; content: string; regulation?: string }[],
): ChecklistItem[] {
  return baseline.map((b, i) => ({
    index: i + 1,
    content: b.content,
    completed: false,
    is_baseline: true,
    baseline_id: b.id,
    regulation: b.regulation,
  }));
}

// Default empty checklist for initialization
export const DEFAULT_CHECKLIST: ChecklistItem[] = [];

// Legacy checklist for reference (not used in dynamic mode)
export const LEGACY_CHECKLIST_ITEMS: ChecklistItem[] = [
  { index: 1, content: '안전벨트 착용' },
  { index: 2, content: '랜야드 고정 위치' },
  { index: 3, content: '발판·작업대 흔들림' },
  { index: 4, content: '작업 위치 난간·가림막' },
  { index: 5, content: '강풍 시 작업 중지 기준' },
  { index: 6, content: '비 올 때 미끄럼·중지 기준' },
  { index: 7, content: '이동 경로 사전 확인' },
  { index: 8, content: '낙하물 주의 안내' },
  { index: 9, content: '안전모 턱끈 착용' },
  { index: 10, content: '작업 위치 변경 여부' },
];
