import type { ChecklistItem } from "./checklist";

export type SessionStatus = "draft" | "confirmed";
export type SessionMode = "TBM" | "EHS";

// v0.2.0: polish dropped, thai + indonesian added.
// Legacy polish sessions are migrated to "english" at IndexedDB v1 -> v2 upgrade.
export type SessionLanguage =
  | "english"
  | "korean"
  | "vietnamese"
  | "thai"
  | "indonesian";

export type SessionDomain =
  | "manufacturing"
  | "construction"
  | "heavy_industry"
  | "semiconductor";

export type PermitType =
  | "HOT_WORK"
  | "CONFINED_SPACE"
  | "WORKING_AT_HEIGHT"
  | "LOTO"
  | "EXCAVATION"
  | "LIFTING"
  | "CHEMICAL_LINE_BREAK"
  | "LASER"
  | "RADIATION"
  | "ELECTRICAL"
  | "OTHER";

export type PermitStatus = "pending" | "issued" | "blocked" | "expired";

export interface PermitRecord {
  permit_id: string;                    // client-generated UUID/timestamp
  permit_type: PermitType;
  scope: string;
  validity_hours: number;
  checklist_items_before_issue: string[];
  status: PermitStatus;
  requested_at: string;                 // ISO timestamp
  issued_at?: string;
  permit_number?: string;               // filled when issued off-app
}

export interface HazardMeasurement {
  metric: string;                       // snake_case, e.g. "SiH4_concentration"
  value: number;
  unit: string;                         // "ppm" | "ppb" | "%" | "%LEL" | "mps" | "kph" | "C" | ...
  location?: string;
  taken_at: string;                     // ISO timestamp (client fills if missing)
  exceeds_threshold?: boolean;
  instrument_id?: string;
}

export interface ChatMessageRecord {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface PriorInformationRecord {
  workLocation?: string;
  workContentDetails?: string;
  numberOfWorkers?: number;
  equipmentDetails?: string;
}

export interface CitationRecord {
  title: string;
  url: string;
  summary: string;
}

export interface CitationDisplayRecord {
  citations: CitationRecord[];
  context?: string;
  timestamp: number;
}

// Forward-looking 8-field checklist (requirement spec §7.1).
// Phase A keeps these optional; Phase B activates them.
// v0.2.0 adds quantitative hazard measurements (semiconductor / heavy_industry).
export interface StructuredChecklist {
  work_summary?: string;
  changes_today?: string;
  hazards?: string[];
  risk_scenarios?: string[];
  mitigations?: string[];
  ppe?: string[];
  special_notes?: string;
  attendance_confirmed?: boolean;
  hazard_measurements?: HazardMeasurement[];
}

export interface Session {
  session_id: string;
  status: SessionStatus;
  mode: SessionMode;
  language: SessionLanguage;
  work_type?: string;
  created_at: string;
  updated_at: string;

  messages: ChatMessageRecord[];
  checklist_items: ChecklistItem[];
  prior_info: PriorInformationRecord;
  citations: CitationDisplayRecord[];

  structured?: StructuredChecklist;
  final_summary?: string;

  // v0.2.0 extensions — all optional for backward compat with v0.1.0 sessions.
  domain?: SessionDomain;
  permits?: PermitRecord[];
  schema_version?: number;              // 2 for v0.2.0; absent => treated as 1
}

export function newSessionId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `tbm_${stamp}_${rand}`;
}

export function createEmptySession(
  mode: SessionMode = "TBM",
  language: SessionLanguage = "korean",
  work_type?: string,
  options?: { domain?: SessionDomain },
): Session {
  const now = new Date().toISOString();
  return {
    session_id: newSessionId(),
    status: "draft",
    mode,
    language,
    work_type,
    created_at: now,
    updated_at: now,
    messages: [],
    checklist_items: [],
    prior_info: {},
    citations: [],
    structured: {},
    domain: options?.domain,
    permits: [],
    schema_version: 2,
  };
}

/** Runtime normalizer: v0.1.0 sessions loaded into v0.2.0 runtime get
 *  safe defaults for new optional fields, and polish -> english fallback. */
export function normalizeSession(s: Session): Session {
  // @ts-expect-error — legacy polish value removed from SessionLanguage type
  const lang: SessionLanguage = s.language === "polish" ? "english" : s.language;
  return {
    ...s,
    language: lang,
    permits: s.permits ?? [],
    structured: s.structured ?? {},
    schema_version: s.schema_version ?? 1,
  };
}
