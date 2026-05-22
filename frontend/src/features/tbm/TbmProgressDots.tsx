// Phase 0.6 Wave 7 — 8필드 진행도 도트 grid.
// 기존 "사전 N/4 · 체크 M/T" 텍스트보다 시각적으로 직관적. 4 prior_info 슬롯
// + 8 structured 필드를 한 줄로 시각화.
// Layout: priorInfo (4 dots, 작음) | 구분자 | structured (8 dots, 큼).

import type { PriorInformation } from "./types";
import type { StructuredChecklist } from "../../services/sessionModel";

interface TbmProgressDotsProps {
  priorInfo: PriorInformation;
  structured: StructuredChecklist;
  /** Touch-friendly compact / wider variant. Default compact. */
  variant?: "compact" | "wide";
}

const PRIOR_KEYS: (keyof PriorInformation)[] = [
  "workLocation",
  "workContentDetails",
  "numberOfWorkers",
  "equipmentDetails",
];

// 8 structured fields per StructuredChecklist (update_session_field tool enum):
//   work_summary, changes_today, hazards, risk_scenarios,
//   mitigations, ppe, special_notes, attendance_confirmed
const STRUCTURED_KEYS: (keyof StructuredChecklist)[] = [
  "work_summary",
  "changes_today",
  "hazards",
  "risk_scenarios",
  "mitigations",
  "ppe",
  "special_notes",
  "attendance_confirmed",
];

function isPriorFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value > 0;
  return Boolean(value);
}

function isStructuredFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  return false;
}

export function TbmProgressDots({
  priorInfo,
  structured,
  variant = "compact",
}: TbmProgressDotsProps): JSX.Element {
  const dotSize = variant === "wide" ? "w-2.5 h-2.5" : "w-2 h-2";
  const gap = variant === "wide" ? "gap-1.5" : "gap-1";

  const priorFilled = PRIOR_KEYS.map((k) => isPriorFilled(priorInfo[k]));
  const structuredFilled = STRUCTURED_KEYS.map((k) => isStructuredFilled(structured[k]));
  const priorCount = priorFilled.filter(Boolean).length;
  const structuredCount = structuredFilled.filter(Boolean).length;

  return (
    <div
      className={`inline-flex items-center ${gap} text-[10px] text-hoban-ink-mute`}
      role="status"
      aria-label={`사전정보 ${priorCount}/4, 8필드 ${structuredCount}/8`}
    >
      <span className="font-medium">사전</span>
      <div className={`flex items-center ${gap}`}>
        {priorFilled.map((on, i) => (
          <span
            key={`p${i}`}
            className={`${dotSize} rounded-full transition-colors ${
              on ? "bg-hoban-primary" : "bg-hoban-border"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="text-hoban-border-strong px-0.5" aria-hidden="true">·</span>
      <span className="font-medium">기록</span>
      <div className={`flex items-center ${gap}`}>
        {structuredFilled.map((on, i) => (
          <span
            key={`s${i}`}
            className={`${dotSize} rounded-full transition-colors ${
              on
                ? i < structuredCount
                  ? "bg-hoban-ink animate-slot-pulse"
                  : "bg-hoban-ink"
                : "bg-hoban-border"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
