// OriginCard — PR E (c6 §3.VI). 사고/위험의 "원인" 카드.
//
// AI가 도출한 위험 시나리오 / 사용자 메모 등 short-form 텍스트.
// SummaryDrawer.risk_scenarios + 사고 원인 분석 inline에 사용.

import { InfoCardBase } from "./InfoCardBase";

interface OriginCardProps {
  origin: string;
  /** "AI" / "user" 출처 라벨. meta 라인에 표시. */
  source?: "ai" | "user";
  className?: string;
}

export function OriginCard({ origin, source, className }: OriginCardProps) {
  const meta =
    source === "ai" ? "AI 분석" : source === "user" ? "사용자 입력" : undefined;
  return (
    <InfoCardBase
      kind="origin"
      title={origin}
      meta={meta}
      className={className}
    />
  );
}
