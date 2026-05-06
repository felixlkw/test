// MitigationCard — PR E (c6 §3.VI). 대응/조치 카드.
//
// HazardCard와 짝을 이루는 액션 카드. SummaryDrawer.mitigations + 추천 조치 inline.

import { InfoCardBase } from "./InfoCardBase";

interface MitigationCardProps {
  mitigation: string;
  /** "photo" / "verbal" 등 증거 요구 라벨. meta에 표시. */
  evidenceRequired?: string;
  /** "catalog" / "llm" / "ai". chip 형태로 rightSlot에 표시. */
  source?: "catalog" | "llm" | "ai";
  className?: string;
}

function MitigationSourceChip({
  source,
}: {
  source: "catalog" | "llm" | "ai";
}) {
  if (source === "catalog") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-pwc text-[10px] font-semibold bg-pwc-bg-card text-pwc-ink-soft border border-pwc-border">
        카탈로그
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-pwc text-[10px] font-semibold bg-pwc-orange-wash text-pwc-orange-deep border border-pwc-orange/30">
      {source === "llm" ? "AI 보강" : "AI"}
    </span>
  );
}

export function MitigationCard({
  mitigation,
  evidenceRequired,
  source,
  className,
}: MitigationCardProps) {
  const meta = evidenceRequired ? `증거: ${evidenceRequired}` : undefined;
  const rightSlot = source ? <MitigationSourceChip source={source} /> : undefined;

  return (
    <InfoCardBase
      kind="mitigation"
      title={mitigation}
      meta={meta}
      rightSlot={rightSlot}
      className={className}
    />
  );
}
