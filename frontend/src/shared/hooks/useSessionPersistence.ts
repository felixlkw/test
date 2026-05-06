// useSessionPersistence — App.tsx L191-255를 통째 이전.
// invariant 가드:
//   #1: shell 레벨에서 1회만 호출
//   #2: hydratedRef gate 그대로
//   #3: 300ms debounce 그대로
//   #4: getSession이 db.ts 내부에서 normalizeSession 통과
//   #5: putSession이 schema_version stamp + updated_at 갱신
//   #10: dep array는 영속 필드만 (view state 누출 금지)
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getSession, putSession } from "../../services/db";
import type {
  Session,
  SessionLanguage,
  SessionDomain,
  StructuredChecklist,
  PermitRecord,
  PreparedBaselineItem,
  PreparedConditionalItem,
  PreparedContext,
  PreparedIncidentCase,
  PreparedScenarioItem,
  PreparedMitigationItem,
  PreparedPpeItem,
  MediaAttachment,
  HazardDetection,
  Attendee,
} from "../../services/sessionModel";
import type { ChecklistItem } from "../../services/checklist";
import type {
  AppMode,
  ChatMessage,
  PriorInformation,
  CitationDisplay,
} from "../../features/tbm/types";

// 자식이 hydrate 결과를 반영하기 위한 setter 묶음.
export interface SessionPersistenceSetters {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChecklist: Dispatch<SetStateAction<ChecklistItem[]>>;
  setPriorInfo: Dispatch<SetStateAction<PriorInformation>>;
  setCitations: Dispatch<SetStateAction<CitationDisplay[]>>;
  setCurrentMode: Dispatch<SetStateAction<AppMode>>;
  setCurrentLanguage: Dispatch<SetStateAction<SessionLanguage>>;
  setStructured: Dispatch<SetStateAction<StructuredChecklist>>;
  setFinalSummary: Dispatch<SetStateAction<string>>;
  setCurrentDomain: Dispatch<SetStateAction<SessionDomain | undefined>>;
  setPermits: Dispatch<SetStateAction<PermitRecord[]>>;
  /** PR A: hydrate work_type_id from Session if present (set by PrepareScreen). */
  setCurrentWorkTypeId?: Dispatch<SetStateAction<string | undefined>>;
  /** PR B+ NEW-H5: hydrate work_type_label (user-friendly Korean label).
   *  PrepareScreen is the single writer; auto-save preserves verbatim. */
  setCurrentWorkTypeLabel?: Dispatch<SetStateAction<string | undefined>>;
  /** PR A 보강: hydrate prepared_hazards (baseline 위험 목록). SummaryDrawer 표시용.
   *  PrepareScreen이 단독 write — 이 hook의 auto-save는 pass-through만. */
  setCurrentPreparedHazards?: Dispatch<SetStateAction<string[] | undefined>>;
  // ── PR A_v2-2: rich prepare-stage hydration (read-only). ───────────────
  // PrepareScreen owns all writes via direct putSession; these setters are
  // hydrate-only so the auto-save dependency array does NOT need to grow
  // (avoids race with PrepareScreen's putSession + invariant #10 view-state
  // exclusion). When RunScreen later needs to inject prepared_summary into
  // the LLM prompt (PR A_v2-4), it reads these via VoiceShell state.
  setCurrentPreparedBaseline?: Dispatch<SetStateAction<PreparedBaselineItem[] | undefined>>;
  setCurrentPreparedConditional?: Dispatch<SetStateAction<PreparedConditionalItem[] | undefined>>;
  setCurrentPreparedQuestions?: Dispatch<SetStateAction<string[] | undefined>>;
  setCurrentPreparedIncidentCases?: Dispatch<SetStateAction<PreparedIncidentCase[] | undefined>>;
  setCurrentPreparedContext?: Dispatch<SetStateAction<PreparedContext | undefined>>;
  setCurrentPreparedAt?: Dispatch<SetStateAction<string | undefined>>;
  setCurrentPreparedSeedRevision?: Dispatch<SetStateAction<string | undefined>>;
  // PR F — prepare 단계 risk scenarios/mitigations/ppe. PrepareScreen 단독
  // writer; auto-save는 verbatim 보존만(아래 putSession 블록과 paired).
  setCurrentPreparedScenarios?: Dispatch<SetStateAction<PreparedScenarioItem[] | undefined>>;
  setCurrentPreparedMitigations?: Dispatch<SetStateAction<PreparedMitigationItem[] | undefined>>;
  setCurrentPreparedPpe?: Dispatch<SetStateAction<PreparedPpeItem[] | undefined>>;
  // PR C — hydrate 사진 메타 + 누적 vision 결과 (영속). VoiceShell이 owner.
  setCurrentAttachments?: Dispatch<SetStateAction<MediaAttachment[] | undefined>>;
  setCurrentHazardDetections?: Dispatch<SetStateAction<HazardDetection[] | undefined>>;
  // PR D — 참석자 + 리포트 ID. FinishScreen 단독 writer라 hydrate-only로 운영해도
  // 무방하지만, RunScreen에서도 종료 진입 시점 등에 attendees 미리보기를 위해
  // hydrate는 항상 적용. auto-save는 PrepareScreen 패턴(직접 putSession)으로
  // FinishScreen이 처리 — 이 hook은 attendees/report_ids를 round-trip만(read-only).
  setCurrentAttendees?: Dispatch<SetStateAction<Attendee[] | undefined>>;
  setCurrentReportIds?: Dispatch<SetStateAction<string[] | undefined>>;
}

// auto-save 시 읽어내야 하는 현재 값(영속 필드만).
export interface SessionPersistenceValues {
  messages: ChatMessage[];
  checklist: ChecklistItem[];
  priorInfo: PriorInformation;
  citations: CitationDisplay[];
  currentMode: AppMode;
  currentLanguage: SessionLanguage;
  structured: StructuredChecklist;
  finalSummary: string;
  currentDomain: SessionDomain | undefined;
  permits: PermitRecord[];
  /** PR A: optional. RunScreen reads it; PrepareScreen owns the writes. */
  currentWorkTypeId?: string;
  // PR C — 사진 메타 + vision 결과는 RunScreen에서 누적되며 영속.
  currentAttachments?: MediaAttachment[];
  currentHazardDetections?: HazardDetection[];
}

export function useSessionPersistence(
  sessionId: string | undefined,
  setters: SessionPersistenceSetters,
  values: SessionPersistenceValues,
): {
  hydratedRef: React.MutableRefObject<boolean>;
  /** PR A_v2-4: state mirror of hydratedRef so consumers can re-render once
   *  hydration completes (e.g. VoiceShell defers auto-start until prepared_*
   *  state is filled in from IndexedDB). Backward compatible — pre-v2-4
   *  consumers that ignore this still work. */
  hydrated: boolean;
} {
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate (App.tsx L191-218)
  useEffect(() => {
    if (!sessionId) {
      hydratedRef.current = true;
      setHydrated(true);
      return;
    }
    hydratedRef.current = false;
    setHydrated(false);
    let cancelled = false;
    getSession(sessionId).then((s) => {
      if (cancelled || !s) {
        hydratedRef.current = true;
        setHydrated(true);
        return;
      }
      // PR C — attachment_ids는 user/assistant 메시지에 옵셔널로 운반.
      // legacy 메시지(undefined)는 그대로 통과.
      setters.setMessages(
        s.messages.map((m) => ({
          role: m.role,
          text: m.text,
          attachment_ids: m.attachment_ids,
        })),
      );
      setters.setChecklist(s.checklist_items);
      setters.setPriorInfo(s.prior_info);
      setters.setCitations(s.citations);
      if (s.mode) setters.setCurrentMode(s.mode);
      if (s.language) setters.setCurrentLanguage(s.language);
      setters.setStructured(s.structured ?? {});
      setters.setFinalSummary(s.final_summary ?? "");
      if (s.domain) setters.setCurrentDomain(s.domain);
      setters.setPermits(s.permits ?? []);
      // PR A: hydrate work_type_id (optional, may be undefined for legacy sessions).
      if (setters.setCurrentWorkTypeId) setters.setCurrentWorkTypeId(s.work_type_id);
      // PR B+ NEW-H5: hydrate work_type_label (Korean label). Legacy sessions => undefined.
      if (setters.setCurrentWorkTypeLabel)
        setters.setCurrentWorkTypeLabel(s.work_type_label);
      // PR A 보강: hydrate prepared_hazards (baseline 위험). SummaryDrawer가 읽음.
      if (setters.setCurrentPreparedHazards)
        setters.setCurrentPreparedHazards(s.prepared_hazards);
      // PR A_v2-2: hydrate rich prepare-stage output (read-only). PrepareScreen
      // is the single writer; we never round-trip these through auto-save.
      if (setters.setCurrentPreparedBaseline)
        setters.setCurrentPreparedBaseline(s.prepared_baseline);
      if (setters.setCurrentPreparedConditional)
        setters.setCurrentPreparedConditional(s.prepared_conditional);
      if (setters.setCurrentPreparedQuestions)
        setters.setCurrentPreparedQuestions(s.prepared_questions);
      if (setters.setCurrentPreparedIncidentCases)
        setters.setCurrentPreparedIncidentCases(s.prepared_incident_cases);
      if (setters.setCurrentPreparedContext)
        setters.setCurrentPreparedContext(s.prepared_context);
      if (setters.setCurrentPreparedAt)
        setters.setCurrentPreparedAt(s.prepared_at);
      if (setters.setCurrentPreparedSeedRevision)
        setters.setCurrentPreparedSeedRevision(s.prepared_seed_revision);
      // PR F — hydrate prepared scenarios/mitigations/ppe (PrepareScreen 단독
      // writer). VoiceShell의 prefill useEffect가 이 값으로 structured 8필드를
      // 1회 prefill한다. legacy session(=PR F 이전)은 undefined → prefill skip.
      if (setters.setCurrentPreparedScenarios)
        setters.setCurrentPreparedScenarios(s.prepared_scenarios);
      if (setters.setCurrentPreparedMitigations)
        setters.setCurrentPreparedMitigations(s.prepared_mitigations);
      if (setters.setCurrentPreparedPpe)
        setters.setCurrentPreparedPpe(s.prepared_ppe);
      // PR C — hydrate 사진 메타 + vision 결과 (옵셔널, legacy session은 undefined).
      if (setters.setCurrentAttachments) setters.setCurrentAttachments(s.attachments);
      if (setters.setCurrentHazardDetections)
        setters.setCurrentHazardDetections(s.hazard_detections);
      // PR D — hydrate 참석자 + 리포트 ID (옵셔널, legacy session은 undefined).
      // FinishScreen이 단독 writer지만 RunScreen에서도 종료 버튼/Drawer 미리보기에 사용.
      if (setters.setCurrentAttendees) setters.setCurrentAttendees(s.attendees);
      if (setters.setCurrentReportIds) setters.setCurrentReportIds(s.report_ids);
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // setters는 stable (setState이 stable). sessionId만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const {
    messages,
    checklist,
    priorInfo,
    citations,
    currentMode,
    currentLanguage,
    structured,
    finalSummary,
    currentDomain,
    permits,
    currentWorkTypeId,
    currentAttachments,
    currentHazardDetections,
  } = values;

  // auto-save — 300ms debounce, hydratedRef gate (App.tsx L221-255)
  useEffect(() => {
    if (!sessionId || !hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const existing = await getSession(sessionId);
        if (!existing) return;
        const nowIso = new Date().toISOString();
        const next: Session = {
          ...existing,
          mode: currentMode,
          language: currentLanguage,
          messages: messages.map((m) => ({
            role: m.role,
            text: m.text,
            at: nowIso,
            // PR C — 첨부 메시지의 ids 보존 (옵셔널).
            attachment_ids: m.attachment_ids,
          })),
          checklist_items: checklist,
          prior_info: priorInfo,
          citations,
          structured,
          final_summary: finalSummary || existing.final_summary,
          domain: currentDomain ?? existing.domain,
          permits,
          // PR A: never overwrite an existing work_type_id with undefined
          // (so RunScreen never wipes the value PrepareScreen wrote).
          work_type_id: currentWorkTypeId ?? existing.work_type_id,
          // PR B+ NEW-H5: work_type_label is PrepareScreen-owned. Preserve verbatim.
          work_type_label: existing.work_type_label,
          // prepared_hazards is a write-once-by-PrepareScreen field; keep as-is.
          prepared_hazards: existing.prepared_hazards,
          // PR A_v2-2: rich prepare-stage fields are also PrepareScreen-owned.
          // RunScreen's auto-save must preserve them verbatim — never overwrite.
          prepared_baseline: existing.prepared_baseline,
          prepared_conditional: existing.prepared_conditional,
          prepared_questions: existing.prepared_questions,
          prepared_incident_cases: existing.prepared_incident_cases,
          prepared_context: existing.prepared_context,
          prepared_at: existing.prepared_at,
          prepared_seed_revision: existing.prepared_seed_revision,
          // PR F — PrepareScreen 단독 writer. RunScreen auto-save는 verbatim 보존.
          prepared_scenarios: existing.prepared_scenarios,
          prepared_mitigations: existing.prepared_mitigations,
          prepared_ppe: existing.prepared_ppe,
          // PR C — 사진 + vision 결과 누적 영속. undefined로 덮어쓰지 않도록 fallback.
          attachments: currentAttachments ?? existing.attachments,
          hazard_detections: currentHazardDetections ?? existing.hazard_detections,
          // PR D — FinishScreen이 단독 writer. RunScreen auto-save는 verbatim 보존.
          // VoiceShell이 attendees/report_ids 신규 setter를 넘기지 않으므로 덮어쓰지 않음.
          attendees: existing.attendees,
          report_ids: existing.report_ids,
          updated_at: nowIso,
        };
        if (!existing.work_type && priorInfo.workContentDetails) {
          next.work_type = priorInfo.workContentDetails;
        }
        if (!next.work_type && structured.work_summary) {
          next.work_type = structured.work_summary;
        }
        await putSession(next);
      })();
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    sessionId,
    messages,
    checklist,
    priorInfo,
    citations,
    currentMode,
    currentLanguage,
    structured,
    finalSummary,
    currentDomain,
    permits,
    currentWorkTypeId,
    currentAttachments,
    currentHazardDetections,
  ]);

  return { hydratedRef, hydrated };
}
