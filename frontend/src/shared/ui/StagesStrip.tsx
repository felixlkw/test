// StagesStrip — PR B (c6 §3.VII, 결정 2=A stepper+chat 병행, 결정 16=B 클릭 시 점프).
// TBM 4 단계 가로 stepper. 시각만 — 단계 강제 이동 X.
// 현재 단계 강조(orange filled), 이전 완료(orange outlined), 미래(회색).
// 클릭 시 onClickStage 호출 — VoiceShell이 ChecklistPanel/SummaryDrawer 토글로 매핑.
//
// invariant #10: 단계는 derive 결과 — 본 컴포넌트는 props로 받기만 하고 영속 X.

import type { TbmStage } from "../../features/tbm/useTbmStage";

interface StagesStripProps {
  currentStage: TbmStage;
  /** c6 §13 결정 16=B: 클릭 시 단계 정보 점프 (read-only 시각 X). */
  onClickStage?: (stage: TbmStage) => void;
}

const STAGE_ORDER: TbmStage[] = [
  "prior_info",
  "checklist",
  "mitigations",
  "finalize",
];

// 2026-05-06 mobile fix — 모바일에 짧은 라벨, 데스크톱은 풀라벨 노출.
// 풀라벨이 4개 합쳐서 360px 폭을 초과해 줄바꿈되던 문제 해결.
const STAGE_LABEL_KO: Record<TbmStage, string> = {
  prior_info: "사전정보",
  checklist: "체크리스트",
  mitigations: "대응방안",
  finalize: "정리",
};
const STAGE_LABEL_KO_SHORT: Record<TbmStage, string> = {
  prior_info: "사전",
  checklist: "점검",
  mitigations: "대응",
  finalize: "정리",
};

export function StagesStrip({ currentStage, onClickStage }: StagesStripProps) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  return (
    <nav
      aria-label="TBM 진행 단계"
      // px-2 sm:px-3, py-1 sm:py-1.5 (모바일 컴팩트).
      className="flex items-center w-full bg-pwc-bg border-b border-pwc-border px-2 sm:px-3 py-1 sm:py-1.5 shrink-0"
    >
      <ol className="flex items-center gap-0.5 sm:gap-1 w-full">
        {STAGE_ORDER.map((stage, idx) => {
          const isCurrent = stage === currentStage;
          const isPast = idx < currentIndex;
          const ariaCurrent = isCurrent ? "step" : undefined;
          // 모바일: gap 좁히고, padding/font 작게. 데스크톱은 기존 동일.
          const baseClass =
            "flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-pwc text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition whitespace-nowrap";
          const stateClass = isCurrent
            ? "bg-pwc-orange text-white"
            : isPast
              ? "border border-pwc-orange text-pwc-orange bg-white"
              : "text-pwc-ink-mute bg-transparent";
          const interactiveClass = onClickStage
            ? "hover:opacity-80 cursor-pointer"
            : "cursor-default";

          // 단계 사이 구분선(─). 마지막 단계 뒤엔 미렌더.
          const sep =
            idx < STAGE_ORDER.length - 1 ? (
              <span
                aria-hidden="true"
                className={`flex-1 h-px mx-0.5 sm:mx-1 ${
                  idx < currentIndex ? "bg-pwc-orange" : "bg-pwc-border"
                }`}
              />
            ) : null;

          return (
            <li
              key={stage}
              className="flex items-center min-w-0"
              style={{ flex: idx < STAGE_ORDER.length - 1 ? "1 1 auto" : "0 0 auto" }}
            >
              <button
                type="button"
                onClick={onClickStage ? () => onClickStage(stage) : undefined}
                disabled={!onClickStage}
                aria-current={ariaCurrent}
                aria-label={`${STAGE_LABEL_KO[stage]} 단계${
                  isCurrent ? " (현재)" : isPast ? " (완료)" : ""
                }`}
                className={`${baseClass} ${stateClass} ${interactiveClass}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full text-[9px] sm:text-[10px] shrink-0 ${
                    isCurrent
                      ? "bg-white text-pwc-orange"
                      : isPast
                        ? "bg-pwc-orange text-white"
                        : "bg-pwc-border text-pwc-ink-mute"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="sm:hidden">{STAGE_LABEL_KO_SHORT[stage]}</span>
                <span className="hidden sm:inline">{STAGE_LABEL_KO[stage]}</span>
              </button>
              {sep}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
