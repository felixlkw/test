// TBMQuestionCard — PR E (c6 §3.VI). TBM 리더가 작업자에게 던질 질문 카드.
//
// SuggestedQuestionChips는 chip 톤(짧은 1줄) — PrepareScreen은 chip 유지.
// 본 카드는 풍부한 설명이 필요한 영역(예: ReportPreview 안 정리본, FinishScreen
// "추천 질문" grid 등) 또는 클릭 시 chat input에 자동 채움 등 인터랙션 표면에서
// 사용. 점선 border + question kind.

import { IconChat } from "../../../components/Icon";
import { InfoCardBase } from "./InfoCardBase";

interface TBMQuestionCardProps {
  question: string;
  /** 클릭 시 chat input에 자동 채움 등 부모 액션. undefined면 read-only. */
  onClick?: () => void;
  className?: string;
}

export function TBMQuestionCard({
  question,
  onClick,
  className,
}: TBMQuestionCardProps) {
  return (
    <InfoCardBase
      kind="question"
      title={question}
      icon={<IconChat size={16} />}
      onClick={onClick}
      className={className}
    />
  );
}
