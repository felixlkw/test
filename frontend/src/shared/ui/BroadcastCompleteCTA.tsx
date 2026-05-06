// BroadcastCompleteCTA — Phase 2.x PR-4. felix Q4=A 권장(구체 카운터) +
// felix Q5=A 권장(자동 모달 X — 펄스만, 사용자 통제권 보존).
//
// 3 시각 상태:
//   1) 비활성 (`!readiness.isReady`): 회색 배경 + cursor-not-allowed +
//      누락 항목 구체 명시 ("체크리스트 3개 · 대응/예방 · 참석 미확인").
//   2) 활성 (`readiness.isReady && !pulsing`): PwC orange + hover 강조 +
//      "📢 작업자 N명에게 전파 완료" (worker_count 있을 때) 또는
//      "📢 작업자에게 전파 완료" (없을 때).
//   3) 펄스 (`readiness.isReady && pulsing`): 활성 + animate-pulse + ring 강조.
//
// 영속 X — view 컴포넌트. invariant #10 준수.
// PwC 토큰만, ts strict, `any` 0건.
import { memo } from "react";
import type { BroadcastReadinessState } from "../../features/tbm/useBroadcastReadiness";

export interface BroadcastCompleteCTAProps {
  readiness: BroadcastReadinessState;
  /** LLM이 request_broadcast_attestation을 호출하면 30초간 true. */
  pulsing: boolean;
  /** prepared_context.worker_count — "작업자 N명" 표기에 사용. 없으면 라벨 생략. */
  workerCount?: number;
  onClick: () => void;
}

/** 비활성 시 누락 항목을 1줄 짧은 한글 문자열로 결합. */
function buildMissingLabel(readiness: BroadcastReadinessState): string {
  const parts: string[] = [];
  if (readiness.missingChecklistCount > 0) {
    parts.push(`체크리스트 ${readiness.missingChecklistCount}개`);
  }
  for (const fld of readiness.missingStructuredFields) {
    parts.push(fld);
  }
  if (readiness.missingAttendance) {
    parts.push("참석 미확인");
  }
  if (parts.length === 0) return "조건 확인 중";
  return parts.join(" · ");
}

function BroadcastCompleteCTAImpl(props: BroadcastCompleteCTAProps) {
  const { readiness, pulsing, workerCount, onClick } = props;
  const isReady = readiness.isReady;

  const activeLabel =
    workerCount !== undefined && workerCount > 0
      ? `작업자 ${workerCount}명에게 전파 완료`
      : "작업자에게 전파 완료";

  // 활성 base class — PwC orange.
  const activeClass =
    "w-full flex items-center justify-center gap-2 bg-pwc-orange hover:bg-pwc-orange-deep text-white font-bold text-[14px] px-4 py-3 rounded-pwc-lg shadow-pwc transition focus:outline-none focus:ring-2 focus:ring-pwc-orange-deep focus:ring-offset-1";
  // 펄스 추가 — animate-pulse + ring.
  const pulseClass = " animate-pulse ring-2 ring-pwc-orange-deep ring-offset-2";
  // 비활성 base — 회색 + cursor-not-allowed.
  const inactiveClass =
    "w-full flex items-center justify-center gap-2 bg-pwc-bg-soft text-pwc-ink-soft font-bold text-[13px] px-4 py-3 rounded-pwc-lg border border-pwc-border-strong cursor-not-allowed transition";

  if (!isReady) {
    const missingLabel = buildMissingLabel(readiness);
    return (
      <div className="px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={onClick}
          disabled
          aria-disabled="true"
          aria-label={`전파 완료 비활성 — 미충족: ${missingLabel}`}
          title={`전파 완료를 활성화하려면 다음을 채우세요: ${missingLabel}`}
          className={inactiveClass}
        >
          <span aria-hidden="true">⏳</span>
          <span>{missingLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={activeLabel}
        title="작업자에게 baseline 위험을 전파했음을 1탭으로 기록"
        className={pulsing ? activeClass + pulseClass : activeClass}
      >
        <span aria-hidden="true">📢</span>
        <span>{activeLabel}</span>
      </button>
    </div>
  );
}

export const BroadcastCompleteCTA = memo(BroadcastCompleteCTAImpl);
