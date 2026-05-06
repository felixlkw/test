// HazardCard — PR E (c6 §3.VI). 5종 카드 통일 — 위험요인.
//
// PrepareScreen baseline·conditional + RunScreen vision 결과 모두 본 카드로
// 통합. baseline은 자물쇠 표시(baselineLocked), conditional은 점선 stroke,
// vision은 confidence bar를 rightSlot에 노출.
//
// invariants:
//   #10: added/undo 토글은 부모(VoiceShell/PrepareScreen) state. 카드는 호출만.

import type { ReactNode } from "react";
import { IconLock } from "../../../components/Icon";
import { InfoCardBase } from "./InfoCardBase";

export type HazardSource = "catalog" | "llm" | "vision";

interface HazardCardProps {
  hazard: string;
  /** 짧은 근거(2~3줄). vision = rationale, baseline = 운영 기준 등. */
  rationale?: string;
  /** 0..1. 표시 시 % 변환. undefined면 bar 미노출. */
  confidence?: number;
  /** PrepareScreen에서 catalog 키, vision에서 카탈로그 매핑 키. */
  domainTag?: string;
  /** 출처 — 카탈로그 / AI 보강 / 사진 분석. SourceChip 자동 생성. */
  source?: HazardSource;
  /** 필수 baseline 항목은 자물쇠 + 추가 버튼 비노출. */
  baselineLocked?: boolean;
  /** 옵셔널 regulation/evidence 라벨. meta 라인에 표시. */
  meta?: string;
  /** 자동 보강 임계 0.7 도달했는지. styling 강조용. */
  autoBoosted?: boolean;
  /** 체크리스트에 이미 추가된 상태. true면 "되돌리기" 버튼 노출. */
  added?: boolean;
  onAdd?: () => void;
  onUndo?: () => void;
  /** 좌측 icon override(default = baselineLocked ? IconLock : 없음). */
  icon?: ReactNode;
  /** 카드 아래 추가 영역(예: bbox overlay 미리보기). */
  extra?: ReactNode;
  className?: string;
}

function SourceChip({ source }: { source: HazardSource }) {
  if (source === "llm") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-pwc text-[10px] font-semibold bg-pwc-orange-wash text-pwc-orange-deep border border-pwc-orange/30"
        title="AI가 컨텍스트를 반영해 추가한 항목"
      >
        AI 보강
      </span>
    );
  }
  if (source === "vision") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-pwc text-[10px] font-semibold bg-pwc-orange text-white"
        title="사진 분석 결과"
      >
        사진
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-pwc text-[10px] font-semibold bg-pwc-bg-card text-pwc-ink-soft border border-pwc-border"
      title="정적 카탈로그(법규·표준 기반)"
    >
      카탈로그
    </span>
  );
}

function ConfidenceBar({
  confidence,
  autoBoosted,
}: {
  confidence: number;
  autoBoosted?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div className="flex items-center gap-2 w-[88px]">
      <div className="flex-1 h-1.5 rounded-full bg-pwc-border overflow-hidden">
        <div
          className={`h-full ${autoBoosted ? "bg-pwc-orange" : "bg-pwc-orange/60"}`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="text-[10px] text-pwc-ink-soft font-semibold tabular-nums shrink-0">
        {pct}%
      </span>
    </div>
  );
}

export function HazardCard({
  hazard,
  rationale,
  confidence,
  domainTag,
  source,
  baselineLocked,
  meta,
  autoBoosted,
  added,
  onAdd,
  onUndo,
  icon,
  extra,
  className,
}: HazardCardProps) {
  // meta 줄: regulation/source 라벨이 결합. id/tag는 부가 정보.
  const metaParts: string[] = [];
  if (meta) metaParts.push(meta);
  if (domainTag) metaParts.push(domainTag);
  const metaLine = metaParts.length > 0 ? metaParts.join(" · ") : undefined;

  // 좌측 아이콘 — 기본은 baselineLocked만 자물쇠. override 가능.
  const resolvedIcon =
    icon ??
    (baselineLocked ? (
      <IconLock size={16} gradient title="필수 항목" />
    ) : undefined);

  // rightSlot — confidence bar + source chip 조합.
  const rightSlot = (
    <div className="flex items-center gap-2">
      {confidence !== undefined && (
        <ConfidenceBar confidence={confidence} autoBoosted={autoBoosted} />
      )}
      {source && <SourceChip source={source} />}
    </div>
  );

  // footer — add/undo 액션. baselineLocked면 액션 비노출(자동 포함됨).
  const footer = baselineLocked ? undefined : added ? (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-pwc-orange-deep">
        ✓ 체크리스트에 추가됨
      </span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="text-[10px] uppercase tracking-wider text-pwc-ink-soft hover:text-pwc-orange-deep font-semibold transition"
        >
          되돌리기
        </button>
      )}
    </div>
  ) : onAdd ? (
    <button
      type="button"
      onClick={onAdd}
      className="text-[10px] uppercase tracking-wider text-pwc-orange hover:text-pwc-orange-deep font-semibold transition"
    >
      + 체크리스트에 추가
    </button>
  ) : undefined;

  return (
    <div className={className}>
      <InfoCardBase
        kind="hazard"
        title={hazard}
        body={rationale}
        meta={metaLine}
        icon={resolvedIcon}
        rightSlot={rightSlot}
        footer={footer}
      />
      {extra && <div className="mt-1.5">{extra}</div>}
    </div>
  );
}
