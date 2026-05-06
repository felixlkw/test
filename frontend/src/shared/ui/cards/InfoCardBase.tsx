// InfoCardBase — PR E (c6 §3.VI). 5종 카드 통일을 위한 공통 wrapper.
//
// 디자인 시스템 진입점:
//   - 모든 카드(HazardCard / OriginCard / MitigationCard / IncidentCaseCard /
//     TBMQuestionCard)는 InfoCardBase를 wrap한다.
//   - kind별 PwC 토큰 매핑은 본 파일 KIND_STYLES에 단일화 — 새 카드 추가 시
//     KIND_STYLES만 갱신.
//   - radius rounded-pwc-lg(8px), padding px-3 py-2, shadow shadow-pwc-card
//     일관 적용. 좌측 icon slot 16~20px.
//
// invariants:
//   #10 (view state 비영속): InfoCardBase 자체는 상태 없음. 펼침/접힘은 부모.

import type { ReactNode } from "react";

export type CardKind =
  | "hazard"
  | "origin"
  | "mitigation"
  | "incident"
  | "question";

interface InfoCardBaseProps {
  kind: CardKind;
  /** 짧은 제목(1줄). 카드의 가장 중요한 시각 strap. */
  title: string;
  /** 본문(2~3줄). string 또는 ReactNode 모두 허용. */
  body?: string | ReactNode;
  /** 작은 메타 텍스트(예: regulation, source label). title 옆에 부제로 표시. */
  meta?: string;
  /** kind별 default 또는 override. 좌측 영역에 16~20px 권장. */
  icon?: ReactNode;
  /** confidence bar / chip / 액션 버튼 등 우측 보조 영역. */
  rightSlot?: ReactNode;
  /** 카드 본문 아래 footer(액션 row 등). */
  footer?: ReactNode;
  /** 점선 border override. question kind는 default true. */
  dashed?: boolean;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

interface KindStyle {
  bg: string;
  border: string;
  text: string;
  meta: string;
  /** title의 강조 색상. 메인 strap. */
  titleColor: string;
}

// 5종 카드 PwC 토큰 매핑 — 단일 디자인 시스템 진입점.
// 테스트(빌드) 시점에 한 번만 평가됨.
const KIND_STYLES: Record<CardKind, KindStyle> = {
  // hazard: 위험요인 — 강조 톤(오렌지 wash + 오렌지 border)
  hazard: {
    bg: "bg-pwc-orange-wash",
    border: "border-pwc-orange/40",
    text: "text-pwc-ink",
    meta: "text-pwc-ink-soft",
    titleColor: "text-pwc-ink",
  },
  // origin: 원인 — 보조 톤(카드 bg + 회색 border + 약한 텍스트)
  origin: {
    bg: "bg-pwc-bg-card",
    border: "border-pwc-border",
    text: "text-pwc-ink-soft",
    meta: "text-pwc-ink-mute",
    titleColor: "text-pwc-ink-soft",
  },
  // mitigation: 조치 — 흰 카드 + 진한 오렌지 border (액션 톤)
  mitigation: {
    bg: "bg-white",
    border: "border-pwc-orange-deep/40",
    text: "text-pwc-ink",
    meta: "text-pwc-ink-soft",
    titleColor: "text-pwc-orange-deep",
  },
  // incident: 사고사례 — 회색 톤(약하게)
  incident: {
    bg: "bg-pwc-bg-soft",
    border: "border-pwc-border",
    text: "text-pwc-ink-mute",
    meta: "text-pwc-ink-mute",
    titleColor: "text-pwc-ink-soft",
  },
  // question: TBM 질문 — 흰 카드 + 점선 border (질문 톤, 클릭 시 hover)
  question: {
    bg: "bg-white",
    border: "border-pwc-border",
    text: "text-pwc-ink",
    meta: "text-pwc-ink-soft",
    titleColor: "text-pwc-ink",
  },
};

export function InfoCardBase({
  kind,
  title,
  body,
  meta,
  icon,
  rightSlot,
  footer,
  dashed,
  className,
  onClick,
  ariaLabel,
}: InfoCardBaseProps) {
  const style = KIND_STYLES[kind];
  const isQuestion = kind === "question";
  const useDashed = dashed ?? isQuestion;
  const interactive = !!onClick;

  const wrapperClass = [
    "rounded-pwc-lg shadow-pwc-card px-3 py-2",
    style.bg,
    style.text,
    "border",
    useDashed ? "border-dashed" : "",
    style.border,
    interactive
      ? "cursor-pointer hover:border-pwc-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange transition-colors text-left"
      : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="flex items-start gap-2">
        {icon && (
          <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-4 h-4">
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div
                className={`text-sm font-semibold leading-snug break-words ${style.titleColor}`}
              >
                {title}
              </div>
              {meta && (
                <div className={`text-[10px] mt-0.5 ${style.meta}`}>{meta}</div>
              )}
            </div>
            {rightSlot && <div className="shrink-0">{rightSlot}</div>}
          </div>
          {body && (
            <div className={`mt-1 text-[12px] leading-snug ${style.text}`}>
              {typeof body === "string" ? <p>{body}</p> : body}
            </div>
          )}
        </div>
      </div>
      {footer && <div className="mt-1.5">{footer}</div>}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={wrapperClass}
        aria-label={ariaLabel ?? title}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={wrapperClass} aria-label={ariaLabel}>
      {content}
    </div>
  );
}
