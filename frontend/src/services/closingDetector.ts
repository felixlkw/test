// closingDetector — PR-feedback-3 (v0.2.3).
//
// 종료 임박(finishing 단계) 진입을 결정하는 4 트리거를 OR로 검사하고,
// 어느 트리거가 충족되었는지 라벨을 반환한다. backend prompt는 본 라벨을
// [Closing Reminder] 블록의 trigger 필드에 포함시켜 자연 환기 발화를 생성한다.
//
// 한 세션당 finishing 진입은 **최초 1회만** — VoiceShell의 useRef(false)로
// 본 유틸 호출 자체를 1회로 게이트한다. 본 모듈은 stateless detector.
//
// 트리거 (OR):
//   A. checklist_70   — 체크리스트 완료율 ≥ 70% (baseline 가중치 2배)
//   B. finish_intent  — 사용자 발화 마무리 키워드 정규식 매칭 (5 언어)
//   C. idle_90s       — 무발화 ≥ 90초 + 진행률 ≥ 50%
//   D. timeout_12min  — TBM 시작 후 12분 경과
//
// LLM 분류 호출은 latency 손해 → 정규식만 사용. 짧은 키워드 리스트로
// 오탐 최소화. 한국어 "다됐", 영어 "we're done" 같은 강한 시그널만.

import type { ChecklistItem } from "./checklist";
import type { SessionLanguage } from "./sessionModel";

export type ClosingTrigger =
  | "checklist_70"
  | "finish_intent"
  | "idle_90s"
  | "timeout_12min";

const FINISH_INTENT_REGEX: Record<SessionLanguage, RegExp> = {
  korean: /(다\s*됐|끝내|마치자|마무리|완료할|이제\s*그만)/,
  english: /(we'?re done|wrap up|finish up|that'?s all|let'?s close)/i,
  vietnamese: /(xong|kết thúc|hoàn tất)/i,
  thai: /(เสร็จ|จบ)/,
  indonesian: /(selesai|tutup|sudah)/i,
};

/**
 * 사용자 발화 텍스트가 마무리 의도 키워드를 포함하는지 검사.
 * language별 정규식 사용 — 다국어 코드스위칭은 본 PR 범위 외.
 */
export function detectFinishIntent(
  utterance: string,
  language: SessionLanguage,
): boolean {
  if (!utterance || !utterance.trim()) return false;
  const re = FINISH_INTENT_REGEX[language] ?? FINISH_INTENT_REGEX.korean;
  return re.test(utterance);
}

/**
 * 체크리스트 완료율 계산 — baseline 가중치 2배.
 * 결과는 0..1 사이.
 *
 * 가중치 근거: PrepareScreen에서 추천된 baseline 항목은 법규/카탈로그 기반
 * 필수 점검이라 dynamic 항목보다 환기 우선순위가 높다. skipped 항목은
 * "사용자 명시 skip"이라 진행률에 반영하지 않음(완료도 미완도 아닌 별도).
 */
export function computeWeightedProgress(checklist: ChecklistItem[]): number {
  if (checklist.length === 0) return 0;
  let totalWeight = 0;
  let completedWeight = 0;
  for (const item of checklist) {
    const w = item.is_baseline ? 2 : 1;
    if (item.skipped) {
      // skipped: 가중치는 분모에 포함하지 않음(분자도 X) — 진행률 분모에서 제외.
      // 사용자 명시 skip은 "환기 대상 아님"으로 처리.
      continue;
    }
    totalWeight += w;
    if (item.completed) completedWeight += w;
  }
  if (totalWeight === 0) return 1; // 모두 skip → 100% (진행 완료 간주)
  return completedWeight / totalWeight;
}

export interface ClosingDetectorState {
  /** TBM 시작 ISO timestamp. */
  sessionStartedAt: string | undefined;
  /** 마지막 사용자 발화 ISO timestamp. */
  lastUtteranceAt: string | undefined;
}

export interface ClosingTriggerResult {
  triggered: boolean;
  trigger?: ClosingTrigger;
}

/**
 * 4 트리거를 OR로 검사. 첫 충족 트리거 라벨을 반환.
 * 우선순위: finish_intent > checklist_70 > idle_90s > timeout_12min.
 *   (finish_intent는 사용자 명시 의도라 즉시 우선)
 */
export function evaluateClosingTriggers(args: {
  checklist: ChecklistItem[];
  state: ClosingDetectorState;
  /** 가장 최근 사용자 발화 텍스트. finish_intent 검사용. */
  lastUserUtterance?: string;
  language: SessionLanguage;
  /** 검사 시점 — Date.now() 주입(테스트 가능성). */
  nowMs: number;
}): ClosingTriggerResult {
  const { checklist, state, lastUserUtterance, language, nowMs } = args;

  // A. finish_intent — 사용자 명시 의도. 우선순위 최고.
  if (
    lastUserUtterance &&
    detectFinishIntent(lastUserUtterance, language)
  ) {
    return { triggered: true, trigger: "finish_intent" };
  }

  // B. checklist_70 — 가중 진행률 ≥ 0.7.
  const progress = computeWeightedProgress(checklist);
  if (progress >= 0.7) {
    return { triggered: true, trigger: "checklist_70" };
  }

  // C. idle_90s — 무발화 90s + 진행률 ≥ 50%.
  if (state.lastUtteranceAt && progress >= 0.5) {
    const lastMs = Date.parse(state.lastUtteranceAt);
    if (Number.isFinite(lastMs) && nowMs - lastMs >= 90_000) {
      return { triggered: true, trigger: "idle_90s" };
    }
  }

  // D. timeout_12min — 시작 후 12분.
  if (state.sessionStartedAt) {
    const startMs = Date.parse(state.sessionStartedAt);
    if (Number.isFinite(startMs) && nowMs - startMs >= 12 * 60_000) {
      return { triggered: true, trigger: "timeout_12min" };
    }
  }

  return { triggered: false };
}

/**
 * [Closing Reminder] 메타 블록 합성. backend prompt가 trigger 라벨을 받아
 * 1문장 마무리 환기를 생성. missing slots / missing checklist는 LLM이
 * 자연 인용하기 위한 컨텍스트.
 */
export function buildClosingReminderBlock(args: {
  trigger: ClosingTrigger;
  missingSlots: string[];
  missingChecklistIds: number[];
}): string {
  const lines: string[] = ["[Closing Reminder]"];
  lines.push(`trigger: ${args.trigger}`);
  lines.push(`missing_slots: [${args.missingSlots.join(", ")}]`);
  lines.push(
    `missing_checklist: [${args.missingChecklistIds.join(", ")}]`,
  );
  return lines.join("\n");
}
