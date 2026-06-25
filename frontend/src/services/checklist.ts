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
  // 적응형 위험추천 (현장 정보 기반) — baseline "필수" 강제 완화.
  //   required === false → context_deprioritized 강등 항목("권장"). 종료 게이트/
  //                        진행률 분모에서 제외되지만 화면/리포트엔 항상 남는다
  //                        (불변식 1: 삭제 아님, 강등).
  //   required !== false (true 또는 undefined) → 기존과 동일 "필수" 취급.
  // 옵셔널이라 IndexedDB v2 스키마 무변경. 기존 세션(undefined) hydrate 시
  // 필수 유지 — legacy 가드(재개 회귀 0).
  // 불변식 2: regulation 보유 항목은 createBaselineChecklistItems에서 항상
  //           required=true 재강제(강등 금지).
  required?: boolean;
  // 적응형 엔진이 "현장정보와 무관"으로 판정해 강등한 항목 표식(감사 추적용).
  // required===false 와 함께 세팅되며, PDF/ReportPreview "권장(미점검)" 라벨 근거.
  context_deprioritized?: boolean;
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
//
// 적응형 위험추천: 추천 응답(PreparedBaselineItem)이 `required`/
// `context_deprioritized` 플래그를 실으면 그대로 전파한다.
//   - 불변식 2 (regulation 강등 금지): `regulation` 값이 있으면 LLM/엔진이
//     무엇을 내려보냈든 required=true 로 hard re-force (프론트 측 2차 방어선).
//   - required undefined → 필드 자체를 세팅하지 않아 기존 "필수" 동작 유지
//     (legacy 가드).
export function createBaselineChecklistItems(
  baseline: {
    id: string;
    content: string;
    regulation?: string;
    required?: boolean;
    context_deprioritized?: boolean;
  }[],
): ChecklistItem[] {
  return baseline.map((b, i) => {
    // 불변식 2 — regulation 보유 항목은 항상 필수.
    const required = b.regulation ? true : b.required;
    const deprioritized = b.regulation ? false : b.context_deprioritized;
    return {
      index: i + 1,
      content: b.content,
      completed: false,
      is_baseline: true,
      baseline_id: b.id,
      regulation: b.regulation,
      // undefined는 그대로 두어 기존 동작(필수) 유지. boolean일 때만 세팅.
      ...(required !== undefined ? { required } : {}),
      ...(deprioritized ? { context_deprioritized: true } : {}),
    };
  });
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
