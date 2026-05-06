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
  /** PR C — 사진 첨부 메시지에 attached MediaAttachment.id 목록.
   *  optional + 후방호환 (legacy 메시지는 undefined). */
  attachment_ids?: string[];
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

  // PR 5 (UI/UX cycle): soft archive marker. ISO timestamp.
  // Absent / undefined = active. Backward compatible (no DB_VERSION bump).
  archived_at?: string;

  // PR A (Phase 2.0 MVP): Prepare-screen output.
  //   work_type_id      — selected catalog entry (e.g. "WORKING_AT_HEIGHT").
  //   prepared_hazards  — baseline+conditional hazard contents the leader
  //                       confirmed before starting RunScreen. Used by
  //                       getEphemeralKey to inject baseline into the prompt.
  // Both optional — DB_VERSION stays at 2 (invariant #6 safeguard).
  work_type_id?: string;
  /** PR B+ NEW-H5: human-readable label for the selected work type (e.g.
   *  "고소 작업"). PrepareScreen mirrors `WorkType.label_ko` here so the LLM
   *  prompt builder can show a user-facing label instead of the raw English ID
   *  ("WORKING_AT_HEIGHT"). Optional + backward-compatible (legacy v0.2.0
   *  sessions stay undefined → backend falls back to `work_type_id`). */
  work_type_label?: string;
  /** PR A_v2-2: deprecate target — derived from prepared_baseline.map(b=>b.content)
   *  for backward compatibility with PR A consumers (SummaryDrawer, RunScreen
   *  baseline injection). Will be removed in a later cycle (felix decision §12-#9). */
  prepared_hazards?: string[];

  // PR A_v2-2: Prepare-stage rich output. All optional (invariant #7).
  // PrepareScreen is the single writer; useSessionPersistence only hydrates.
  /** Baseline items with source ("catalog" | "llm") preserved. */
  prepared_baseline?: PreparedBaselineItem[];
  /** Conditional items with `if` predicate + source. */
  prepared_conditional?: PreparedConditionalItem[];
  /** LLM-suggested starter questions for the leader to ask workers. */
  prepared_questions?: string[];
  /** Incident-case placeholders (Phase 2.1 will replace via embedding RAG). */
  prepared_incident_cases?: PreparedIncidentCase[];
  /** User-provided context (worker_count, shift, wind_speed_mps, ...). PR A_v2-3
   *  introduces the form; A_v2-2 leaves this undefined. */
  prepared_context?: PreparedContext;
  /** ISO timestamp of the last successful recommend-hazards refresh. */
  prepared_at?: string;
  /** Catalog seed revision string (e.g. "v0.2.0-1777842609"). Lets the UI
   *  surface staleness without parsing the underlying epoch. */
  prepared_seed_revision?: string;
  // PR F — Push paradigm: prepare 단계가 함께 가져오는 위험 시나리오·대응 조치·
  // 보호구. RunScreen 진입 즉시 VoiceShell의 prefill useEffect가 structured
  // 8필드를 채우는 재료. PrepareScreen 단독 writer.
  prepared_scenarios?: PreparedScenarioItem[];
  prepared_mitigations?: PreparedMitigationItem[];
  prepared_ppe?: PreparedPpeItem[];

  // ── PR C (Phase 2.0 MVP — 사진 분석, c5 §4) ─────────────────────────────
  // All optional (invariant #7). attachments는 메타만 — blob은 별도 store
  // (services/attachmentStore.ts → IndexedDB `attachments` store).
  // hazard_detections는 누적 — undo 시 structured_anchor_idx로 정확한 항목 제거.
  /** 사진 첨부 메타. blob_ref는 attachments store key(=id)와 동일. */
  attachments?: MediaAttachment[];
  /** vision 분석 결과 누적. 자동 보강된 항목은 structured_anchor_idx 보유. */
  hazard_detections?: HazardDetection[];

  // ── PR D (Phase 2.0 MVP — c6 §3.VIII 참석자, §3.IX 리포트) ─────────────
  // 참석자 PII는 IndexedDB 로컬만 (felix 결정 7=A). 백엔드 영구 저장 X.
  // signature_data_url(base64 PNG)은 Session에 직접 inline — PR C attachments
  // store는 사진 전용. 서명은 평균 ~3-10 KB이라 inline 부담 X.
  /** TBM 종료 시 입력되는 참석자 목록 (felix 결정 8=B). 옵셔널. */
  attendees?: Attendee[];
  /** 생성된 리포트 ID 목록. blob은 attachments store에 보관(Phase 2.0 재사용). */
  report_ids?: string[];
  /** PR D — 보존 기간(Q8) 정책: archived_at 기준으로 만료 시 삭제. 본 필드는
   *  세션별 override 미지원 — Settings global retentionDays만 사용. (placeholder) */

  // ── Phase 2.x PR-5 (in-place attestation) — 리더 서명 메타 ─────────────
  // CTA 탭 → AttestationModal → 손가락 캔버스 서명 또는 체크박스 폴백 →
  // attachment_type="leader_attestation"으로 attachments store에 PNG 저장 →
  // 본 필드에 메타 stamp. 모두 옵셔널 (invariant #7).
  leader_attestation?: LeaderAttestation;

  // ── Phase 2.x PR-6 (broadcast PDF) — 자동 생성된 전파 확인서 ID ────────
  // attestation 직후 `generateBroadcastReportPdf`로 PDF 생성 → attachments store에
  // attachment_type="tbm_report" PDF blob 저장 → 본 필드에 id stamp. 옵셔널.
  // report_ids[]와 별개 — Phase 2.x broadcast 흐름 전용 단일 슬롯.
  broadcast_report_id?: string;
}

// ---------------------------------------------------------------------------
// PR C (c5 §4.1) — 사진 + vision 분석 데이터 모델.
// 모두 옵셔널 + Session에 옵셔널 등재(invariant #7). blob 자체는 IndexedDB
// `attachments` store에 별도 저장(metadata만 Session에 — 비대화 회피).
// ---------------------------------------------------------------------------
export interface MediaAttachment {
  /** uuid — attachments store의 key와 일치. */
  id: string;
  /** PR C는 "image"만. "video"는 Phase 3(c5 결정 5). */
  type: "image" | "video";
  mime: string;
  size_bytes: number;
  /** ISO timestamp. */
  captured_at: string;
  /** ~200x200 base64 data URL. inline이라 빠른 list render가 가능하지만
   *  ~50KB/이미지라 30장 이상 시 비대화 위험 — c5 §13 #5에서 Phase 2 이관
   *  검토. PR C는 inline. */
  thumbnail_data_url?: string;
  caption?: string;
  /** attachments store key — 기본은 id와 동일. */
  blob_ref: string;
  origin: "camera" | "upload";
  /** Phase 2 이관(c5 결정 2). PR C는 미설정/false. */
  face_blurred?: boolean;
  /** Phase 2.x PR-5/PR-6 — 첨부 분류. 옵셔널, 기존 photo는 미지정으로 보존.
   *  - "photo": PR C 사진(기본 가정).
   *  - "leader_attestation": PR-5 리더 서명 PNG.
   *  - "tbm_report": PR-6 broadcast PDF. */
  attachment_type?: "photo" | "leader_attestation" | "tbm_report";
}

export interface HazardDetection {
  id: string;
  /** 어느 첨부에 대한 결과인지. MediaAttachment.id 참조. */
  attachment_id: string;
  hazard: string;
  /** 도메인 카탈로그 키 (e.g. "construction.fall_protection"). */
  domain_tag?: string;
  /** 0..1. PR C 자동 보강 임계 = 0.7(felix 결정 7). */
  confidence: number;
  /** [x, y, w, h] normalized 0..1. Phase 2에서 정교화. */
  bbox?: [number, number, number, number];
  rationale: string;
  suggested_mitigation?: string;
  /** ISO timestamp. */
  detected_at: string;
  /** structured.hazards[]에 자동 추가된 항목의 인덱스. undo용.
   *  (c5 §13 #6: 사용자가 다른 항목을 수동 삽입/삭제하면 어긋남 — Phase 2
   *  에서 id 기반 마이그레이션 예정. PR C는 인덱스 기반.) */
  structured_anchor_idx?: number;
}

// ---------------------------------------------------------------------------
// PR D (c6 §3.VIII / §3.IX) — 참석자 + 리포트 데이터 모델.
// 모두 옵셔널. PII는 IndexedDB 로컬만(felix 결정 7=A). 서명은 캔버스 PNG
// data URL(felix 결정 6=A+C). PDF blob은 attachments store(PR C 재사용).
// ---------------------------------------------------------------------------
export interface Attendee {
  /** uuid — crypto.randomUUID(). */
  id: string;
  name: string;
  role?: string;
  /** 캔버스 서명 또는 confirm 체크박스 통과 시 true. */
  signed?: boolean;
  /** ISO timestamp. */
  signed_at?: string;
  /** signature_pad → canvas.toDataURL("image/png"). 평균 ~3-10 KB.
   *  confirm 체크박스만 통과한 경우 undefined(felix 결정 6 A+C 병행). */
  signature_data_url?: string;
}

export interface Report {
  /** uuid. */
  id: string;
  session_id: string;
  format: "pdf" | "json";
  /** ISO timestamp. */
  generated_at: string;
  /** PDF인 경우 attachments store key(=id와 동일). JSON인 경우 미설정. */
  blob_ref?: string;
  /** JSON 리포트 페이로드. PDF인 경우 미설정. */
  json_payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Phase 2.x PR-5 — Leader attestation (in-place 서명).
// PR-4 BroadcastCompleteCTA 탭 → AttestationModal → 손가락 서명 또는 체크박스
// 폴백 → attachments store에 PNG 저장(attachment_type="leader_attestation") →
// Session.leader_attestation에 메타 stamp. 모두 옵셔널 + invariant #7.
// ---------------------------------------------------------------------------
export interface LeaderAttestation {
  /** attachments store record id — PNG blob. method="checkbox" 면 빈 1x1 PNG
   *  또는 "consent" 마커 PNG가 저장됨(서명 방식 명시). */
  signature_attachment_id: string;
  /** ISO timestamp — 서명 확정 시점. */
  signed_at: string;
  /** 서명 시점 기준 prepared_context.worker_count의 스냅샷. 미입력 세션은 1. */
  worker_count_attested: number;
  /** felix Q6 권장 캔버스 서명 vs 체크박스 폴백(felix 결정 6=A+C 병행 동등). */
  method: "canvas" | "checkbox";
}

// ---------------------------------------------------------------------------
// PR A_v2-2 — Prepare-stage rich output types.
// All shapes are loose-by-design to mirror the on-the-wire JSON from
// /api/recommend-hazards 1:1 (see services/recommendHazards.ts).
// ---------------------------------------------------------------------------
export interface PreparedBaselineItem {
  id: string;
  content: string;
  regulation?: string;
  evidence_required?: string;
  source: "catalog" | "llm";
  // Phase 2.x PR-1 — per-item mapping. Each baseline hazard MAY carry its own
  // 1~2 scenarios / mitigations / ppe items linked to that hazard. Older
  // backend payloads (PR F era) leave these undefined; new clients prefer the
  // per-item arrays and fall back to the top-level flat arrays
  // (`Session.prepared_scenarios` / `_mitigations` / `_ppe`) when absent.
  scenarios?: PreparedScenarioItem[];
  mitigations?: PreparedMitigationItem[];
  ppe?: PreparedPpeItem[];
}

export interface PreparedConditionalItem {
  /** Predicate string (e.g. "wind_speed >= 10"). Evaluated server-side later. */
  if: string;
  id: string;
  content: string;
  regulation?: string;
  source: "catalog" | "llm";
}

export interface PreparedIncidentCase {
  title: string;
  summary: string;
  source?: string;
}

// PR F — Push paradigm shift. Prepare 단계가 baseline 위험뿐 아니라 risk
// scenarios / mitigations / ppe까지 함께 가져오면 RunScreen 진입 즉시
// structured 8필드를 prefill할 수 있다(VoiceShell의 prefill useEffect).
// 모두 옵셔널 + loose dict — backend가 빈 배열을 반환할 수도 있고, legacy 세션은
// undefined로 들어옴.
export interface PreparedScenarioItem {
  id: string;
  content: string;
  source: "catalog" | "llm";
}

export interface PreparedMitigationItem {
  id: string;
  content: string;
  source: "catalog" | "llm";
}

export interface PreparedPpeItem {
  id: string;
  content: string;
  source: "catalog" | "llm";
}

export interface PreparedContext {
  worker_count?: number;
  shift?: string;
  wind_speed_mps?: number;
  new_material?: string;
  special_notes?: string;
  previous_incident_keywords?: string[];
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
    archived_at: s.archived_at, // explicit pass-through (legacy v1 sessions => undefined => active)
    // PR A: explicit pass-through so legacy sessions (without these fields)
    // get undefined values rather than silently dropped (invariant #4).
    work_type_id: s.work_type_id,
    work_type_label: s.work_type_label,
    prepared_hazards: s.prepared_hazards,
    // PR A_v2-2: prepare-stage rich output — all optional, undefined for legacy.
    prepared_baseline: s.prepared_baseline,
    prepared_conditional: s.prepared_conditional,
    prepared_questions: s.prepared_questions,
    prepared_incident_cases: s.prepared_incident_cases,
    prepared_context: s.prepared_context,
    prepared_at: s.prepared_at,
    prepared_seed_revision: s.prepared_seed_revision,
    // PR F — prepare 단계 risk scenarios/mitigations/ppe pass-through. Legacy
    // session(=PR F 이전 저장)은 undefined → VoiceShell prefill useEffect가
    // 빈 배열로 취급해 prefill을 skip(회귀 0).
    prepared_scenarios: s.prepared_scenarios,
    prepared_mitigations: s.prepared_mitigations,
    prepared_ppe: s.prepared_ppe,
    // PR C: 사진 + vision 결과 — 모두 옵셔널, legacy session은 undefined.
    attachments: s.attachments,
    hazard_detections: s.hazard_detections,
    // PR D: 참석자 + 리포트 — 모두 옵셔널 + pass-through.
    attendees: s.attendees,
    report_ids: s.report_ids,
    // Phase 2.x PR-5/PR-6: 리더 서명 + broadcast PDF id — 모두 옵셔널.
    leader_attestation: s.leader_attestation,
    broadcast_report_id: s.broadcast_report_id,
  };
}
