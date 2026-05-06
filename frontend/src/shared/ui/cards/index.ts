// PR E (c6 §3.VI) — 5종 카드 통일 barrel export.
//
// 단일 디자인 시스템 진입점. 모든 신규 카드 사용은 본 export 경로로 통일:
//   import { HazardCard, IncidentCaseCard } from "../shared/ui/cards";

export { InfoCardBase } from "./InfoCardBase";
export type { CardKind } from "./InfoCardBase";
export { HazardCard } from "./HazardCard";
export type { HazardSource } from "./HazardCard";
export { OriginCard } from "./OriginCard";
export { MitigationCard } from "./MitigationCard";
export { IncidentCaseCard } from "./IncidentCaseCard";
export { TBMQuestionCard } from "./TBMQuestionCard";
