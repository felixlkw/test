// VoiceShell — Cycle 3: chat-log-centric paradigm.
// 단일 owner: useSessionPersistence는 여기서만 호출(invariant #1).
// 레이아웃: header → progressbar(TBM) → ChatList(flex-1) → InputDock.
// 자동 시작: mount 후 sessionId 있을 때 1회. mic OFF로 시작.
// PR B+ Cleanup: 폐기 5 컴포넌트(VoiceCenter / BottomStack / ChatLogPanel /
//   CueOrCTA / CircleButton) 파일 삭제 + setShowChatLog 더미 제거 + App.css
//   `.compact-voice-btn` / `pulse-ring` / `pulse-boom` / `slim-progress-bar` /
//   layout grid 클래스 잔재 제거. VoiceStatusChip은 PwC Tailwind 토큰만 사용.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WebRTCSession, PreparedSummary } from "../../services/webrtc";
import { DEFAULT_CHECKLIST, type ChecklistItem } from "../../services/checklist";
import type {
  StructuredChecklist,
  PermitRecord,
  SessionLanguage,
  SessionDomain,
  PreparedBaselineItem,
  PreparedConditionalItem,
  PreparedContext,
  PreparedScenarioItem,
  PreparedMitigationItem,
  PreparedPpeItem,
  MediaAttachment,
  HazardDetection,
  LeaderAttestation,
} from "../../services/sessionModel";
import { createEmptySession } from "../../services/sessionModel";
import {
  addAttachment,
  generateAttachmentId,
  getAttachmentBlob,
} from "../../services/attachmentStore";
import { getSession, putSession, archiveSession } from "../../services/db";
import {
  generateBroadcastReportPdf,
  buildBroadcastReportFilename,
} from "../../services/pdfGenerate";
import { triggerDownload } from "../../services/sessionDownload";
import { generateThumbnail, resizeImage } from "../../services/imageProcessing";
import { analyzeImage, VisionAnalyzeError } from "../../services/visionAnalyze";
import { IconDoc } from "../../components/Icon";
import type {
  AppMode,
  AppProps,
  ChatMessage,
  CitationDisplay,
  PriorInformation,
} from "../../features/tbm/types";
import {
  getInitialCueMessage,
  getChatFallbackWarning,
  getChatFallbackWarningAuthQuota,
  getRetryVoiceLabel,
  getContinueChatLabel,
} from "../i18n/cueMessages";
import { useSessionPersistence } from "../hooks/useSessionPersistence";
import { useChecklistProgress } from "../../features/tbm/useChecklistProgress";
import { useStructuredProgress } from "../../features/tbm/useStructuredProgress";
import { useInterruption } from "../../features/tbm/useInterruption";
import { useWebRTCEvents } from "../../features/tbm/useWebRTCEvents";
import { useBroadcastReadiness } from "../../features/tbm/useBroadcastReadiness";
import { useTbmSession, type UseTbmSessionResult } from "../../features/tbm/useTbmSession";
import { useChatSession } from "../../features/chat/useChatSession";
import { useEhsSession } from "../../features/ehs/useEhsSession";
import { useRecommendedQuestions } from "../../features/ehs/useRecommendedQuestions";

import { VoiceTopBar } from "./VoiceTopBar";
import { ProgressStack } from "./ProgressStack";
import { ChatList } from "./ChatList";
import { InputDock } from "./InputDock";
import { ChecklistPanel } from "../../features/tbm/ChecklistPanel";
import { Portal } from "../portal/PortalRoot";
import { SummaryDrawer } from "../portal/SummaryDrawer";
import { InterruptionToast } from "../portal/InterruptionToast";
import { StagesStrip } from "../ui/StagesStrip";
import { BroadcastCompleteCTA } from "../ui/BroadcastCompleteCTA";
import { AttestationModal, type AttestationConfirmResult } from "../portal/AttestationModal";
import { ReportPreviewModal } from "../portal/ReportPreviewModal";
import { deriveTbmStage, type TbmStage } from "../../features/tbm/useTbmStage";

export default function VoiceShell({ sessionId, initialMode, initialDomain }: AppProps = {}) {
  const navigate = useNavigate();
  // ── 영속 상태 ─────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [priorInfo, setPriorInfo] = useState<PriorInformation>({});
  const [citations, setCitations] = useState<CitationDisplay[]>([]);
  const [currentMode, setCurrentMode] = useState<AppMode>(initialMode || "TBM");
  const [currentLanguage, setCurrentLanguage] = useState<SessionLanguage>("korean");
  const [structured, setStructured] = useState<StructuredChecklist>({});
  const [hazardSuggestions, setHazardSuggestions] = useState<
    { hazard: string; rationale: string }[]
  >([]);
  const [finalSummary, setFinalSummary] = useState<string>("");
  const [currentDomain, setCurrentDomain] = useState<SessionDomain | undefined>(initialDomain);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  // PR A: work_type_id is loaded from Session via useSessionPersistence hydration
  // (see hook for hydration). Held here as state so RunScreen rerenders if the
  // value changes (e.g. user navigates back to Prepare and updates).
  const [currentWorkTypeId, setCurrentWorkTypeId] = useState<string | undefined>(undefined);
  // PR B+ NEW-H5: 사용자 친화 한국어 라벨. PrepareScreen이 단독 writer.
  // preparedSummary.work_type_label에 inject — LLM이 영문 ID 대신 한국어로 인식.
  const [currentWorkTypeLabel, setCurrentWorkTypeLabel] = useState<string | undefined>(
    undefined,
  );
  // PR A 보강: prepared_hazards (baseline 위험). PrepareScreen이 write, 여기선 read만.
  // SummaryDrawer "준비 단계 필수 점검" 섹션에 노출.
  const [currentPreparedHazards, setCurrentPreparedHazards] = useState<
    string[] | undefined
  >(undefined);

  // PR A_v2-4: rich prepare-stage hydration. PrepareScreen 단독 write — 여기선
  // useSessionPersistence가 hydrate-only로 채워주고 RunScreen은 read만 한다.
  // prepared_summary derive (LLM 첫 발화 inject) 용도.
  const [currentPreparedBaseline, setCurrentPreparedBaseline] = useState<
    PreparedBaselineItem[] | undefined
  >(undefined);
  const [, setCurrentPreparedConditional] = useState<
    PreparedConditionalItem[] | undefined
  >(undefined);
  const [, setCurrentPreparedQuestions] = useState<string[] | undefined>(undefined);
  const [currentPreparedContext, setCurrentPreparedContext] = useState<
    PreparedContext | undefined
  >(undefined);
  // PR F — Push paradigm. PrepareScreen이 가져오는 risk scenarios / mitigations /
  // ppe. VoiceShell의 prefill useEffect가 이 값으로 structured 8필드를 1회 prefill.
  const [currentPreparedScenarios, setCurrentPreparedScenarios] = useState<
    PreparedScenarioItem[] | undefined
  >(undefined);
  const [currentPreparedMitigations, setCurrentPreparedMitigations] = useState<
    PreparedMitigationItem[] | undefined
  >(undefined);
  const [currentPreparedPpe, setCurrentPreparedPpe] = useState<
    PreparedPpeItem[] | undefined
  >(undefined);

  // ── PR C — 사진 첨부 + vision 결과 영속 상태 ─────────────────────
  // hydrate는 useSessionPersistence가 처리. 여기는 owner state.
  const [currentAttachments, setCurrentAttachments] = useState<
    MediaAttachment[] | undefined
  >(undefined);
  const [currentHazardDetections, setCurrentHazardDetections] = useState<
    HazardDetection[] | undefined
  >(undefined);

  // ── 비영속 view state (memory only — invariant #10) ──
  const [input, setInput] = useState("");
  const [showChecklistPanel, setShowChecklistPanel] = useState(false);
  const [cueMessage, setCueMessage] = useState<string>("");
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [, setIsInputFocused] = useState(false);
  // talking 상태는 events와 session 두 쪽에서 모두 setTalking이 필요 → shell에서 owner.
  const [talking, setTalking] = useState<"idle" | "user" | "assistant">("idle");
  // Phase 2.x PR-4 — broadcastPulsing. LLM이 request_broadcast_attestation 호출 시
  // 30초간 true → BroadcastCompleteCTA가 펄스 애니메이션. 영속 X (invariant #10) —
  // useState memory only. 사용자가 직접 클릭하거나 30초 만료 시 자동 false.
  const [broadcastPulsing, setBroadcastPulsing] = useState(false);
  // Phase 2.x PR-5 — AttestationModal 토글. 영속 X (invariant #10).
  const [attestationModalOpen, setAttestationModalOpen] = useState(false);
  // Phase 2.x PR-6 — ReportPreviewModal 토글 + PDF blob 상태. 메모리만.
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPdfBlob, setReportPdfBlob] = useState<Blob | null>(null);
  const [reportFilename, setReportFilename] = useState<string>("");
  const [reportError, setReportError] = useState<string | null>(null);
  // Cycle 3: 마이크 토글 상태(view-only). 자동 시작 시 OFF.
  const [micEnabled, setMicEnabled] = useState(false);
  // Phase chat-PR2: 채팅 폴백 트랜스포트. 메모리 only — 영속 X (invariant #10,
  // 사용자 결정 §3: 세션별 결정. 다음 세션은 다시 voice 자동시도). voice
  // 자동시도 catch 에서 setTransport("chat") 으로 전환되며, 사용자가 마이크
  // 버튼으로 다시 voice 시도 가능 (PR-3 에서 핸들러 추가).
  const [transport, setTransport] = useState<"voice" | "chat">("voice");
  // PR B+ NEW-H4: 첫 임프레션 마이크 토글 안내. localStorage `safemate.ui.micHintDismissed`
  // 미설정이고 micEnabled=false일 때만 노출. 닫으면 다시 안 뜸 (영구 dismiss).
  // invariant #10: localStorage `safemate.ui.*` 네임스페이스 — IndexedDB 미유출.
  const [micHintVisible, setMicHintVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem("safemate.ui.micHintDismissed") !== "1";
    } catch {
      return true;
    }
  });
  const dismissMicHint = useCallback(() => {
    setMicHintVisible(false);
    try {
      localStorage.setItem("safemate.ui.micHintDismissed", "1");
    } catch {
      // localStorage 비활성/quota — 화면에서만 dismiss.
    }
  }, []);

  // ── refs ──────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<WebRTCSession | null>(null);

  // ── persistence (shell 1회만 호출 — invariant #1) ────
  // PR A_v2-4: capture `hydrated` to gate auto-start on prepare-stage hydration.
  const { hydrated } = useSessionPersistence(
    sessionId,
    {
      setMessages,
      setChecklist,
      setPriorInfo,
      setCitations,
      setCurrentMode,
      setCurrentLanguage,
      setStructured,
      setFinalSummary,
      setCurrentDomain,
      setPermits,
      setCurrentWorkTypeId,
      setCurrentWorkTypeLabel,
      setCurrentPreparedHazards,
      // PR A_v2-4: rich prepare-stage hydration setters (read-only).
      setCurrentPreparedBaseline,
      setCurrentPreparedConditional,
      setCurrentPreparedQuestions,
      setCurrentPreparedContext,
      // PR F — Push paradigm prepare-stage rich data. hydrate-only.
      setCurrentPreparedScenarios,
      setCurrentPreparedMitigations,
      setCurrentPreparedPpe,
      // PR C — hydrate 사진 메타 + vision 결과.
      setCurrentAttachments,
      setCurrentHazardDetections,
    },
    {
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
      // PR C — auto-save 시 사진 + vision 결과 누적.
      currentAttachments,
      currentHazardDetections,
    },
  );

  // ── interruption ─────────────────────────────────────
  const interruption = useInterruption({ setMessages });

  // ── recommended questions ────────────────────────────
  // Cycle 3: chat 안 inline chip row로 노출. citations 누적 시 회전 정지.
  // PR D Q5 (OLD-M11): hover/focus 시 자동 pause + 사용자가 칩에 마우스/포커스 떠나면 resume.
  // 비영속 view state — invariant #10. 영구 저장 0건.
  const [recommendedHovered, setRecommendedHovered] = useState(false);
  const recommendedPausedByCitations =
    currentMode === "EHS" && citations.length > 0;
  const recommendedPaused =
    recommendedPausedByCitations || recommendedHovered;
  const recommended = useRecommendedQuestions(currentMode, recommendedPaused);
  const setShowRecommendedQuestions = recommended.setShowRecommendedQuestions;
  const resetRecommendedQuestions = useCallback(() => {
    setShowRecommendedQuestions(false);
  }, [setShowRecommendedQuestions]);

  // ── webrtc events ───────────────────────────────────
  // Phase 2.x PR-4 — onBroadcastReady. LLM이 request_broadcast_attestation 호출 시
  // 30초간 펄스. setTimeout cleanup은 다음 호출 시 자연 무시 (id race 무관 —
  // setTimeout이 자체적으로 boolean 토글만 함).
  const events = useWebRTCEvents({
    sessionRef,
    currentMode,
    setMessages,
    setTalking,
    setChecklist,
    setPriorInfo,
    setCueMessage,
    setStructured,
    setHazardSuggestions,
    setFinalSummary,
    setShowSummaryDrawer,
    setPermits,
    setCitations,
    showInterruptionMessage: interruption.showInterruptionMessage,
    onBroadcastReady: useCallback(() => {
      setBroadcastPulsing(true);
      // 30초 후 자동 해제 — 사용자 통제권 보존(felix Q5=A).
      window.setTimeout(() => setBroadcastPulsing(false), 30000);
    }, []),
  });

  // ── voice session ───────────────────────────────────
  // Phase chat-PR2: 이름만 voiceSession 으로 변경. session 변수는 chatSession
  // 마운트 후 transport 에 따라 swap 된다. EHS 추천 질문 click handler 는 본 PR
  // 단계에서 voiceSession 을 그대로 사용 — chat 모드 호환은 PR-3 에서 추가.
  const voiceSession = useTbmSession({
    audioRef,
    sessionRef,
    currentMode,
    currentLanguage,
    currentDomain,
    currentWorkTypeId,
    setCurrentMode,
    setMessages,
    setChecklist,
    setPriorInfo,
    setCitations,
    setStructured,
    setHazardSuggestions,
    setFinalSummary,
    setPermits,
    setCueMessage,
    setShowLanguageSelector,
    dismissInterruption: interruption.dismissInterruption,
    onEvent: events.onEvent,
    resetRecommendedQuestions,
    setTalking,
    // Phase chat-PR2: voice 자동 시작 실패 시 chat 트랜스포트로 폴백.
    // PR-3 에서 워닝 메시지 push + 액션 버튼 부착이 추가된다.
    onConnectionFailed: useCallback(
      (_kind: "auth_quota" | "network", _msg: string) => {
        setTransport("chat");
      },
      [],
    ),
  });

  // ── progress ────────────────────────────────────────
  const { completedCount, progressPercent } = useChecklistProgress(checklist);
  const { structuredProgressPercent } = useStructuredProgress(structured);

  // Phase 2.x PR-4 — Broadcast readiness derived state.
  // 4 종료 게이트 검사: baseline checklist 100% + structured 4필드 + attendance.
  // 영속 X (invariant #10) — useMemo 사용.
  const broadcastReadiness = useBroadcastReadiness(checklist, structured);

  // ── PR B (c6 §3.VII) — TBM 단계 derive ───────────────
  // useMemo로 매 렌더 derive, 영속 X (invariant #10).
  const currentStage = useMemo<TbmStage>(
    () => deriveTbmStage(structured, checklist, finalSummary),
    [structured, checklist, finalSummary],
  );
  // 클릭 시 매핑(c6 결정 16=B):
  //   prior_info → SummaryDrawer/Panel 닫기 + chat 상단으로(현재는 닫기만)
  //   checklist  → ChecklistPanel 토글 open
  //   mitigations / finalize → SummaryDrawer open
  const handleClickStage = useCallback(
    (stage: TbmStage) => {
      if (stage === "checklist") {
        setShowChecklistPanel(true);
        setShowSummaryDrawer(false);
        return;
      }
      if (stage === "mitigations" || stage === "finalize") {
        setShowSummaryDrawer(true);
        setShowChecklistPanel(false);
        return;
      }
      // prior_info: 패널/드로어 닫고 chat 상단으로 — chat은 native scroll이라 별도 ref 불필요.
      setShowChecklistPanel(false);
      setShowSummaryDrawer(false);
    },
    [],
  );

  // ── EHS click handler ─────────────────────────────
  // Phase chat-PR2: voiceSession 을 직접 참조. chat 모드에서의 추천 질문 동작
  // 호환은 PR-3 에서 transport 분기와 함께 추가된다.
  const ehs = useEhsSession({
    sessionRef,
    sessionActive: voiceSession.sessionActive,
    talking,
    setMessages,
    setShowRecommendedQuestions,
    startSession: voiceSession.startSession,
  });

  // ── language change cue 초기화 ─────────────────────
  // Cycle 3: chat이 main이라 cue는 system 메시지로. 초기화 시점에 cueMessage만 세팅.
  useEffect(() => {
    setCueMessage(getInitialCueMessage(currentLanguage));
  }, [currentLanguage]);

  // ── PR A_v2-4 + PR F: prepared_summary derive ───────────────────
  // baseline 상위 3건 + 컨텍스트 한 줄 요약 → /api/webrtc-key body로 전달.
  // backend prompt.py가 instructions에 [Prepare Stage Result] 블록 inject.
  //
  // PR F (felix 신뢰 #3): 가드 완화. 이전엔 baseline 비면 undefined 반환 → 사용자가
  // PrepareContextForm을 정성껏 채워도 recommend-hazards 실패(429 등) 시 그 정보가
  // 그대로 사라졌다. 이제 baseline / context / work_type 중 하나라도 있으면 전달.
  // backend도 _format_prepared_summary_block 가드 완화로 짝지움.
  //
  // PR F: context_summary에 special_notes / previous_incident_keywords 추가 —
  // 리더가 입력한 특이사항 / 과거 사고 키워드가 LLM의 첫 발화에서 자연 인용됨.
  //
  // PR F: has_full_baseline 힌트 — backend BRIEFING_REVIEW_MODE 분기에 사용.
  //   true: Push 브리핑 도우미 모드 활성, prior_info 수집 skip.
  //   false: 전통 Pull 모드 fallback.
  const preparedSummary = useMemo<PreparedSummary | undefined>(() => {
    const baseline = currentPreparedBaseline ?? [];
    const ctx = currentPreparedContext;
    const labelOrId = currentWorkTypeLabel ?? currentWorkTypeId ?? "";
    const ctxParts: string[] = [];
    if (ctx?.worker_count !== undefined) ctxParts.push(`작업자 ${ctx.worker_count}명`);
    if (ctx?.shift) ctxParts.push(`교대 ${ctx.shift}`);
    if (ctx?.wind_speed_mps !== undefined) ctxParts.push(`풍속 ${ctx.wind_speed_mps} m/s`);
    if (ctx?.new_material) ctxParts.push(`신규 자재 ${ctx.new_material}`);
    if (ctx?.special_notes) ctxParts.push(`특이사항: ${ctx.special_notes}`);
    if (ctx?.previous_incident_keywords && ctx.previous_incident_keywords.length > 0) {
      ctxParts.push(`과거 사고: ${ctx.previous_incident_keywords.join(", ")}`);
    }
    const contextSummary = ctxParts.length ? ctxParts.join(", ") : "";

    // PR F — 가드 완화: 이전엔 baseline 비면 undefined. 이제 baseline / label /
    // context 중 하나라도 있으면 전달. 모두 비어있으면 undefined.
    const hasAnything =
      baseline.length > 0 || !!labelOrId || !!contextSummary;
    if (!hasAnything) return undefined;

    const top = baseline.slice(0, 3).map((b) => b.content);
    return {
      // PR B+ NEW-H5: 사용자 친화 한국어 라벨 우선, 없으면 영문 id, 둘 다 없으면 빈 문자열.
      work_type_label: labelOrId,
      baseline_count: baseline.length,
      top_hazards: top,
      context_summary: contextSummary,
      // PR F — Briefing Review Mode 분기 힌트.
      has_full_baseline: baseline.length >= 3,
    };
  }, [
    currentPreparedBaseline,
    currentPreparedContext,
    currentWorkTypeId,
    currentWorkTypeLabel,
  ]);

  // ── chat session (Phase chat-PR2) ──────────────────────
  // voice 자동 시도 실패(또는 사용자 명시 선택) 시 swap 되는 트랜스포트.
  // useTbmSession 의 UseTbmSessionResult 시그니처와 호환되어 같은 session
  // 변수로 사용 가능. preparedSummary 는 매 렌더 derive — useChatSession
  // 내부 useEffect 가 ref 동기화하므로 첫 렌더 undefined 도 안전.
  const chatSession = useChatSession({
    currentMode,
    currentLanguage,
    currentDomain,
    currentWorkTypeId,
    preparedSummary,
    setCurrentMode,
    setMessages,
    setChecklist,
    setPriorInfo,
    setCitations,
    setStructured,
    setHazardSuggestions,
    setFinalSummary,
    setPermits,
    setCueMessage,
    setShowLanguageSelector,
    setTalking,
    dismissInterruption: interruption.dismissInterruption,
    resetRecommendedQuestions,
  });

  // Phase chat-PR2: transport 에 따라 swap. 본 PR 까지는 setTransport 트리거가
  // useTbmSession 의 onConnectionFailed 콜백 1곳뿐. PR-3 에서 사용자 토글
  // (마이크 버튼 → 음성 재시도, 워닝 액션 버튼) 이 추가된다.
  const session: UseTbmSessionResult =
    transport === "voice" ? voiceSession : chatSession;

  // ── Cycle 3 + PR A_v2-4: 자동 시작 ─────────────────────
  // mount 후 1회만 호출. 이미 sessionActive면 useTbmSession.startSession 내부 가드가 처리.
  // mic은 OFF로 시작 — 사용자가 InputDock 토글로 ON.
  // PR A_v2-4: hydrated=true 까지 대기 — IndexedDB에서 prepared_baseline/context를
  // 채운 뒤 preparedSummary가 정상 derive되도록. autoStartedRef는 1회만 통과.
  // Phase chat-PR2: 자동 시작은 voice 우선. 실패 시 onConnectionFailed →
  // setTransport("chat"). chat 으로 폴백된 후엔 별도 startSession 호출 불필요
  // (사용자 첫 입력 시 sendTextMessage 가 자동 시작). PR-3 에서 자동 폴백
  // 직후 TBM + preparedSummary 케이스에 한해 chatSession.requestInitialBriefing
  // 호출이 추가된다.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!hydrated) return;
    autoStartedRef.current = true;
    void voiceSession.startSession(null, null, {
      micInitiallyEnabled: false,
      preparedSummary,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── PR F + Phase 2.x PR-2 — Push paradigm: structured 8필드 자동 prefill ──
  // hydrated && currentMode === "TBM" && prepare 단계 데이터가 있으면 1회만:
  //   work_summary  ← work_type_label + special_notes
  //   changes_today ← new_material + previous_incident_keywords
  //   hazards       ← prepared_baseline.content[]
  //   risk_scenarios← baseline[i].scenarios per-item flatMap → flat fallback
  //   mitigations   ← baseline[i].mitigations per-item flatMap → flat fallback
  //   ppe           ← baseline[i].ppe per-item flatMap → flat fallback
  // 회귀 가드(felix invariant 보존):
  //   1) prefilledRef로 1회만 통과 (재마운트 시에만 다시 시도).
  //   2) 기존 structured 필드에 값이 있으면 보존 (resume 회귀 0).
  //   3) prepare 데이터(baseline/scenarios/mitigations/ppe/context) 모두 비면 skip
  //      → legacy 세션 + EHS 모드에서 누출 0.
  //   4) PR-2 변경: per-item 우선, flat fallback. PR F 직후 세션(per-item 미존재,
  //      flat만 있음)도 동일하게 prefill. dedup으로 중복 0.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!hydrated) return;
    if (currentMode !== "TBM") return;
    // 데이터가 하나라도 있어야 prefill — 모두 비면 legacy 세션이라 skip.
    const baseline = currentPreparedBaseline ?? [];
    const scenariosFlat = currentPreparedScenarios ?? [];
    const mitigationsFlat = currentPreparedMitigations ?? [];
    const ppeFlat = currentPreparedPpe ?? [];
    const ctx = currentPreparedContext;
    const hasAnyPrepareData =
      baseline.length > 0 ||
      scenariosFlat.length > 0 ||
      mitigationsFlat.length > 0 ||
      ppeFlat.length > 0 ||
      !!ctx?.special_notes ||
      !!ctx?.new_material ||
      (ctx?.previous_incident_keywords?.length ?? 0) > 0;
    if (!hasAnyPrepareData) return;

    // PR-2 — per-item 우선 derive. baseline[i].scenarios 합쳐서 우선 사용,
    // 비어있으면 flat (PR F era) 배열로 fallback. 두 케이스 모두 dedup 처리.
    const dedupNonEmpty = (arr: string[]): string[] =>
      Array.from(
        new Set(
          arr
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter((s) => s.length > 0),
        ),
      );

    const newRiskScenarios = (() => {
      const fromBaseline = baseline
        .flatMap((b) => (b.scenarios ?? []).map((s) => s.content))
        .filter((c): c is string => typeof c === "string" && c.length > 0);
      if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
      return dedupNonEmpty(scenariosFlat.map((s) => s.content));
    })();

    const newMitigations = (() => {
      const fromBaseline = baseline
        .flatMap((b) => (b.mitigations ?? []).map((m) => m.content))
        .filter((c): c is string => typeof c === "string" && c.length > 0);
      if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
      return dedupNonEmpty(mitigationsFlat.map((m) => m.content));
    })();

    const newPpe = (() => {
      const fromBaseline = baseline
        .flatMap((b) => (b.ppe ?? []).map((p) => p.content))
        .filter((c): c is string => typeof c === "string" && c.length > 0);
      if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
      return dedupNonEmpty(ppeFlat.map((p) => p.content));
    })();

    setStructured((prev) => {
      const next: StructuredChecklist = { ...prev };

      // work_summary: 기존 비어있으면 work_type_label (+ special_notes 한 줄).
      if (!next.work_summary) {
        const parts = [
          currentWorkTypeLabel ?? currentWorkTypeId,
          ctx?.special_notes,
        ].filter(Boolean) as string[];
        if (parts.length) next.work_summary = parts.join(" — ");
      }

      // changes_today: 기존 비어있으면 new_material + previous_incident_keywords.
      if (!next.changes_today) {
        const parts: string[] = [];
        if (ctx?.new_material) parts.push(`신규 자재: ${ctx.new_material}`);
        if (ctx?.previous_incident_keywords && ctx.previous_incident_keywords.length > 0) {
          parts.push(`과거 사고 키워드: ${ctx.previous_incident_keywords.join(", ")}`);
        }
        if (parts.length) next.changes_today = parts.join(" / ");
      }

      // hazards: 기존 비어있으면 prepared_baseline.content[]. dedup.
      if (!next.hazards || next.hazards.length === 0) {
        const arr = dedupNonEmpty(baseline.map((b) => b.content));
        if (arr.length) next.hazards = arr;
      }

      // risk_scenarios: per-item 우선 → flat fallback.
      if (!next.risk_scenarios || next.risk_scenarios.length === 0) {
        if (newRiskScenarios.length) next.risk_scenarios = newRiskScenarios;
      }

      // mitigations: per-item 우선 → flat fallback.
      if (!next.mitigations || next.mitigations.length === 0) {
        if (newMitigations.length) next.mitigations = newMitigations;
      }

      // ppe: per-item 우선 → flat fallback.
      if (!next.ppe || next.ppe.length === 0) {
        if (newPpe.length) next.ppe = newPpe;
      }

      return next;
    });

    prefilledRef.current = true;
  }, [
    hydrated,
    currentMode,
    currentPreparedBaseline,
    currentPreparedScenarios,
    currentPreparedMitigations,
    currentPreparedPpe,
    currentPreparedContext,
    currentWorkTypeLabel,
    currentWorkTypeId,
  ]);

  // ── Cycle 3 + Phase chat-PR3: 마이크 / 음성 세션 실패 → chat 폴백 안내 ──
  // 변경: 기존엔 voiceSession.micError 를 보고 단순 [안내] 메시지를 push 했음.
  // PR-3 부터는 voiceSession.micError 발생 시:
  //   1) 5언어 카피로 안내 메시지 push (auth_quota 와 일반 network 분기)
  //   2) [다시 시도] / [채팅으로 계속] 액션 버튼 부착 (영속화 X — invariant #10)
  //   3) clearMicError
  //   4) TBM + preparedSummary 가 있으면 chatSession.requestInitialBriefing()
  //      자동 호출 — 사용자가 빈 화면을 보고 멈추는 경우 방지.
  // transport 전환 자체는 useTbmSession 의 onConnectionFailed 콜백이 이미 처리.
  // session 은 chatSession 으로 swap 되어 있음.
  const chatFallbackPushedRef = useRef(false);
  useEffect(() => {
    if (!voiceSession.micError) return;
    if (chatFallbackPushedRef.current) {
      // 이미 동일 폴백 이벤트로 1회 push 한 상태 — 중복 push 차단. retry voice
      // 시 ref 리셋(handleRetryVoice 에서 처리).
      voiceSession.clearMicError();
      return;
    }
    const isAuthQuota = voiceSession.micError.includes(
      "일시적으로 접근할 수 없습니다",
    );
    const text = isAuthQuota
      ? `[안내] ${getChatFallbackWarningAuthQuota(currentLanguage)}`
      : `[안내] ${getChatFallbackWarning(currentLanguage)}`;
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text,
        actions: [
          { id: "retry_voice", label: getRetryVoiceLabel(currentLanguage) },
          { id: "continue_chat", label: getContinueChatLabel(currentLanguage) },
        ],
      },
    ]);
    chatFallbackPushedRef.current = true;
    voiceSession.clearMicError();
    if (currentMode === "TBM" && preparedSummary) {
      void chatSession.requestInitialBriefing();
    }
  }, [
    voiceSession,
    chatSession,
    currentMode,
    preparedSummary,
    currentLanguage,
    setMessages,
  ]);

  // ── Phase chat-PR3: voice 재시도 핸들러 (chat → voice) ──
  // chat 모드로 폴백된 사용자가 음성 회복을 시도. 워닝 메시지의 [다시 시도]
  // 버튼과 InputDock 마이크 버튼 chat 모드 클릭이 모두 이 함수를 호출.
  const handleRetryVoice = useCallback(() => {
    setTransport("voice");
    chatFallbackPushedRef.current = false;
    void voiceSession.startSession(null, null, {
      micInitiallyEnabled: true,
      preparedSummary,
    });
    setMicEnabled(true);
  }, [voiceSession, preparedSummary]);

  // ── Cycle 3 + Phase chat-PR3: 마이크 토글 핸들러 ─────────────
  // 세션 active면 즉시 track.enabled 반전. 아니면 startSession을 mic ON으로 재시작.
  // chat 모드면 음성 재시도(handleRetryVoice).
  const handleToggleMic = useCallback(() => {
    if (transport === "chat") {
      handleRetryVoice();
      return;
    }
    if (!session.sessionActive) {
      // 세션이 아직 안 떴거나 종료됨 → mic ON으로 시작.
      // PR A_v2-4: preparedSummary inject (TBM only — useTbmSession이 mode 분기).
      void session.startSession(null, null, {
        micInitiallyEnabled: true,
        preparedSummary,
      });
      setMicEnabled(true);
      return;
    }
    const next = !micEnabled;
    sessionRef.current?.setMicEnabled(next);
    setMicEnabled(next);
  }, [transport, handleRetryVoice, session, micEnabled, preparedSummary]);

  // ── Phase chat-PR3: ChatList 액션 버튼 클릭 핸들러 ───────────
  // 메시지에 부착된 [다시 시도] / [채팅으로 계속] 버튼 클릭. messageIdx 는
  // 클릭된 메시지의 인덱스, actionId 는 ChatMessageAction.id.
  const handleMessageAction = useCallback(
    (messageIdx: number, actionId: "retry_voice" | "continue_chat") => {
      if (actionId === "retry_voice") {
        handleRetryVoice();
      }
      // 클릭된 메시지에서 actions 제거 (한 번 누르면 사라짐).
      setMessages((prev) => {
        if (!prev[messageIdx]) return prev;
        const next = [...prev];
        const cur = next[messageIdx];
        const { actions: _drop, ...rest } = cur;
        void _drop;
        next[messageIdx] = { ...rest };
        return next;
      });
    },
    [handleRetryVoice, setMessages],
  );

  // ── 세션이 꺼질 때 mic 토글 상태 리셋 ───────────────
  useEffect(() => {
    if (!session.sessionActive) {
      setMicEnabled(false);
    }
  }, [session.sessionActive]);

  // ── PR C — 사진 캡처 + vision 분석 핸들러 ─────────────────────────
  // 흐름 (c5 §3.6, felix 결정 7):
  //   1. resize + EXIF strip → ~300KB jpg blob
  //   2. attachmentStore.addAttachment → uuid 회수
  //   3. thumbnail 생성 → MediaAttachment 메타 누적
  //   4. user 메시지(첨부) + system "분석 중…" 메시지 추가
  //   5. analyzeImage → HazardDetectionResponse
  //   6. HazardDetection[] 누적 (id 생성), confidence ≥ 0.7 자동 보강
  //   7. assistant 메시지(summary) 추가, "분석 중…" 제거
  // 실패 시: chat에 system "분석 실패" 메시지 추가, attachments는 그대로 보존.
  const ANALYZING_TEXT = "사진 분석 중…";
  const handlePhotoCaptured = useCallback(
    async (blob: Blob, mime: string, origin: "camera" | "upload") => {
      if (!sessionId) return;
      // 1) resize + thumbnail
      let resized: Blob;
      let thumbnailDataUrl: string | undefined;
      try {
        resized = await resizeImage(blob);
        thumbnailDataUrl = await generateThumbnail(resized);
      } catch (err) {
        // 캔버스 실패 — 원본을 그대로 사용해 끊김 회피.
        console.warn("imageProcessing failed, falling back to raw blob:", err);
        resized = blob;
      }
      const effectiveMime =
        resized.type && resized.type.startsWith("image/") ? resized.type : mime;

      // 2) attachmentStore 저장 → id 회수
      let attachmentId: string;
      try {
        attachmentId = await addAttachment(sessionId, resized, effectiveMime);
      } catch (err) {
        console.error("addAttachment failed:", err);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "[안내] 사진을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
          },
        ]);
        return;
      }

      // 3) MediaAttachment 메타 누적
      const meta: MediaAttachment = {
        id: attachmentId,
        type: "image",
        mime: effectiveMime,
        size_bytes: resized.size,
        captured_at: new Date().toISOString(),
        thumbnail_data_url: thumbnailDataUrl,
        blob_ref: attachmentId,
        origin,
      };
      setCurrentAttachments((prev) => [...(prev ?? []), meta]);

      // 4) chat — user 메시지(첨부) + 시스템 "분석 중…"
      setMessages((prev) => [
        ...prev,
        { role: "user", text: "(사진 첨부)", attachment_ids: [attachmentId] },
        { role: "assistant", text: ANALYZING_TEXT },
      ]);

      // 5) analyzeImage 호출
      const recentTexts = messages.slice(-4).map((m) => `${m.role}: ${m.text}`);
      let response;
      try {
        response = await analyzeImage({
          blob: resized,
          domain: currentDomain,
          language: currentLanguage,
          contextMessages: recentTexts,
        });
      } catch (err) {
        console.warn("analyzeImage failed:", err);
        const reason =
          err instanceof VisionAnalyzeError
            ? err.message
            : "사진 분석 중 오류가 발생했습니다.";
        // "분석 중…" 메시지를 실패 메시지로 교체 (마지막 assistant 메시지 1건).
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i -= 1) {
            if (next[i].role === "assistant" && next[i].text === ANALYZING_TEXT) {
              next[i] = {
                role: "assistant",
                text: `[안내] ${reason}`,
                attachment_ids: [attachmentId],
              };
              return next;
            }
          }
          return [
            ...next,
            {
              role: "assistant",
              text: `[안내] ${reason}`,
              attachment_ids: [attachmentId],
            },
          ];
        });
        return;
      }

      // 6) HazardDetection[] 누적 + 자동 보강 (confidence ≥ 0.7)
      const nowIso = new Date().toISOString();
      const newDetections: HazardDetection[] = response.hazards.map((h) => ({
        id: generateAttachmentId(),
        attachment_id: attachmentId,
        hazard: h.hazard,
        domain_tag: h.domain_tag,
        confidence: h.confidence,
        bbox: h.bbox,
        rationale: h.rationale,
        suggested_mitigation: h.suggested_mitigation,
        detected_at: nowIso,
      }));

      // 자동 보강: confidence ≥ 0.7 항목을 structured.hazards에 append.
      // structured_anchor_idx 영속 — 부모(VoiceShell) state mutation으로 구현.
      // 2026-05-06 felix HITL — TBM 전용. EHS는 체크리스트가 없는 Q&A 모드라
      // structured.hazards에 push하면 dead data가 되며 "체크리스트에 추가됨"
      // 라벨이 잘못된 멘탈 모델을 준다. 가드로 EHS는 push 0건 → detections에
      // structured_anchor_idx 부여도 안 됨 → footer 라벨/버튼 자연 소거.
      if (currentMode === "TBM") {
        setStructured((prevStructured) => {
          const existingHazards = prevStructured.hazards ?? [];
          const additions: string[] = [];
          const idxMap = new Map<string, number>(); // detection.id -> structured idx
          let runningIdx = existingHazards.length;
          for (const d of newDetections) {
            if (d.confidence >= 0.7) {
              additions.push(d.hazard);
              idxMap.set(d.id, runningIdx);
              runningIdx += 1;
            }
          }
          // anchor 정보를 newDetections에 stamp.
          for (const d of newDetections) {
            const idx = idxMap.get(d.id);
            if (idx !== undefined) d.structured_anchor_idx = idx;
          }
          if (additions.length === 0) return prevStructured;
          return {
            ...prevStructured,
            hazards: [...existingHazards, ...additions],
          };
        });
      }

      setCurrentHazardDetections((prev) => [...(prev ?? []), ...newDetections]);

      // 7) "분석 중…" 메시지 → assistant summary 메시지로 교체.
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant" && next[i].text === ANALYZING_TEXT) {
            next[i] = {
              role: "assistant",
              text: response.summary,
              attachment_ids: [attachmentId],
            };
            return next;
          }
        }
        return [
          ...next,
          {
            role: "assistant",
            text: response.summary,
            attachment_ids: [attachmentId],
          },
        ];
      });

      // 8) Vision 결과 음성 narration — 2026-05-06 felix HITL.
      // 카드만 보여주고 끝나면 사용자가 화면을 읽어야 하므로, WebRTC LLM에
      // vision 결과를 system 메시지로 주입해 AI가 1~2문장 음성으로 자연스럽게
      // 설명하게 한다. sendTextMessage는 dataChannel 닫힘 시 silently noop하므로
      // 세션 미연결 시 degrade는 자연스럽게 카드 표시만 남는다.
      //
      // 모드별 게이트:
      //   EHS — 항상 활성. Q&A 모드라 narration이 자연스러움.
      //   TBM — currentStage가 prior_info / checklist일 때만 활성. mitigations /
      //         finalize 단계는 Broadcast Mode + 종료 흐름이 진행 중이라
      //         narration이 사용자 통제권을 끊을 수 있어 skip.
      // auto-boost된 항목 수는 narration 텍스트에 반영해 AI가 "체크리스트에
      // 자동 추가했다"고 자연 설명하게 함 (TBM 한정).
      const isEhsNarrationOn = currentMode === "EHS";
      const isTbmNarrationOn =
        currentMode === "TBM" &&
        (currentStage === "prior_info" || currentStage === "checklist");
      if ((isEhsNarrationOn || isTbmNarrationOn) && sessionRef.current) {
        const hazardLines = response.hazards
          .slice(0, 5)
          .map(
            (h, i) =>
              `  ${i + 1}. ${h.hazard} (confidence ${Math.round(h.confidence * 100)}%)`,
          )
          .join("\n");
        const autoBoostedCount =
          currentMode === "TBM"
            ? newDetections.filter((d) => d.confidence >= 0.7).length
            : 0;
        const boostNote =
          autoBoostedCount > 0
            ? `\n\nAuto-boost: ${autoBoostedCount} hazard(s) with confidence >= 70% have been added to the TBM checklist (structured.hazards). Mention this naturally in your reply.`
            : "";
        const flowTail = isTbmNarrationOn
          ? " After speaking, continue the TBM flow naturally (do not jump stages)."
          : " Optionally ask one brief follow-up question to clarify the scene.";
        const narrationPrompt =
          response.hazards.length === 0
            ? `[Vision Analysis Result]\nSummary: ${response.summary}\nNo specific hazards detected.\n\nInstruction: Briefly verbally acknowledge this result in 1 sentence in your configured response language.${flowTail} Do NOT call any tool — just speak.`
            : `[Vision Analysis Result]\nSummary: ${response.summary}\nHazards identified (${response.hazards.length}):\n${hazardLines}${boostNote}\n\nInstruction: Verbally explain these findings in 1-2 short sentences in your configured response language. Highlight the most critical hazard first.${flowTail} Do NOT call any tool — just speak.`;
        try {
          sessionRef.current.sendTextMessage(
            narrationPrompt,
            "system",
            true /* audioResponse */,
          );
        } catch (err) {
          // 데모용 안전망 — sendTextMessage 자체 실패는 카드 표시에 영향 X.
          console.warn(
            "[VoiceShell] vision narration sendTextMessage failed:",
            err,
          );
        }
      }
    },
    [
      sessionId,
      messages,
      currentMode,
      currentStage,
      currentDomain,
      currentLanguage,
      setMessages,
      setStructured,
    ],
  );

  // ── PR C — HazardResultCard에서 호출하는 add/undo 핸들러 ──────────
  // detection 단건의 structured.hazards 보강/되돌리기. anchor 인덱스는 detection
  // 자체에 영속 — VoiceShell state로 round-trip.
  const handleAddDetectionToStructured = useCallback(
    (detectionId: string) => {
      setCurrentHazardDetections((prevDetections) => {
        const detections = prevDetections ?? [];
        const target = detections.find((d) => d.id === detectionId);
        if (!target) return prevDetections;
        if (target.structured_anchor_idx !== undefined) return prevDetections;
        let newAnchorIdx = -1;
        setStructured((prevStructured) => {
          const existing = prevStructured.hazards ?? [];
          newAnchorIdx = existing.length;
          return { ...prevStructured, hazards: [...existing, target.hazard] };
        });
        if (newAnchorIdx < 0) return prevDetections;
        return detections.map((d) =>
          d.id === detectionId
            ? { ...d, structured_anchor_idx: newAnchorIdx }
            : d,
        );
      });
    },
    [setStructured],
  );

  const handleUndoDetectionFromStructured = useCallback(
    (detectionId: string) => {
      setCurrentHazardDetections((prevDetections) => {
        const detections = prevDetections ?? [];
        const target = detections.find((d) => d.id === detectionId);
        if (!target || target.structured_anchor_idx === undefined) return prevDetections;
        const removeIdx = target.structured_anchor_idx;
        setStructured((prevStructured) => {
          const existing = prevStructured.hazards ?? [];
          if (removeIdx < 0 || removeIdx >= existing.length) {
            return prevStructured;
          }
          const next = [...existing];
          next.splice(removeIdx, 1);
          return { ...prevStructured, hazards: next };
        });
        // anchor 인덱스 시프트: 더 큰 anchor를 가진 다른 detection은 -1.
        return detections.map((d) => {
          if (d.id === detectionId) {
            return { ...d, structured_anchor_idx: undefined };
          }
          if (
            d.structured_anchor_idx !== undefined &&
            d.structured_anchor_idx > removeIdx
          ) {
            return { ...d, structured_anchor_idx: d.structured_anchor_idx - 1 };
          }
          return d;
        });
      });
    },
    [setStructured],
  );

  // PR B+ NEW-H4: 마이크가 켜지면 안내 자동 dismiss(영구 저장).
  useEffect(() => {
    if (micEnabled && micHintVisible) {
      dismissMicHint();
    }
  }, [micEnabled, micHintVisible, dismissMicHint]);

  // 추천질문 클릭 wrapper — chat list 안 chip 클릭. transport 분기:
  //   voice: 기존 ehs handler — sessionRef.sendTextMessage 또는 startSession.
  //   chat (Phase chat-PR3): chatSession.sendTextMessage 직접 호출.
  // chat 분기에서 setShowRecommendedQuestions(false) 는 handleClick 내부에서 직접
  // 처리. retrieve(citations) 는 chatSession.sendTextMessage 가 내부에서 호출.
  const handleClickRecommendedQuestion = useCallback(
    (q: string) => {
      if (transport === "chat") {
        setShowRecommendedQuestions(false);
        void chatSession.sendTextMessage(
          q,
          "idle",
          () => {},
          events.logRetrieveForUserMessage,
        );
        return;
      }
      void ehs.handleRecommendedQuestionClick(q);
    },
    [
      transport,
      chatSession,
      ehs,
      events.logRetrieveForUserMessage,
      setShowRecommendedQuestions,
    ],
  );

  // ── Phase 2.x PR-5 — handleAttestationConfirmed ──────────────────
  // AttestationModal onConfirm({blob, method}). 다음 4 단계를 한번에 처리:
  //   1) 방어적 보강 — 체크리스트 일괄 체크 + attendance_confirmed=true +
  //      비어있는 8필드 prefill 재실행. PR-4 readiness 게이트가 이미 100% 보장
  //      한다 가정하나 race / 재마운트 케이스 안전망.
  //   2) attachment 저장 — addAttachment + attachment_type="leader_attestation".
  //      PR-5 명세상 신규 옵셔널 필드(attachment_type) 사용.
  //   3) leader_attestation 메타 stamp + putSession.
  //   4) AttestationModal 닫기 + ReportPreviewModal open (PR-6 흐름 시작).
  //
  // putSession 내부에서 db는 normalizeSession을 통해 leader_attestation을
  // pass-through. invariant #4·#5 보존.
  const handleAttestationConfirmed = useCallback(
    async (result: AttestationConfirmResult) => {
      if (!sessionId) return;
      const nowIso = new Date().toISOString();

      // 1) 방어적 보강 — 체크리스트 + attendance + 8필드 prefill 재실행.
      setChecklist((prev) =>
        prev.map((item) => ({
          ...item,
          completed: true,
          utterance: item.utterance ?? "전파 완료",
          checkedAt: item.checkedAt ?? nowIso,
        })),
      );

      const baselineArr = currentPreparedBaseline ?? [];
      const dedupNonEmpty = (arr: string[]): string[] =>
        Array.from(
          new Set(
            arr
              .map((s) => (typeof s === "string" ? s.trim() : ""))
              .filter((s) => s.length > 0),
          ),
        );
      const cbScen = (() => {
        const fromBaseline = baselineArr
          .flatMap((b) => (b.scenarios ?? []).map((s) => s.content))
          .filter((c): c is string => typeof c === "string" && c.length > 0);
        if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
        return dedupNonEmpty(
          (currentPreparedScenarios ?? []).map((s) => s.content),
        );
      })();
      const cbMit = (() => {
        const fromBaseline = baselineArr
          .flatMap((b) => (b.mitigations ?? []).map((m) => m.content))
          .filter((c): c is string => typeof c === "string" && c.length > 0);
        if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
        return dedupNonEmpty(
          (currentPreparedMitigations ?? []).map((m) => m.content),
        );
      })();
      const cbPpe = (() => {
        const fromBaseline = baselineArr
          .flatMap((b) => (b.ppe ?? []).map((p) => p.content))
          .filter((c): c is string => typeof c === "string" && c.length > 0);
        if (fromBaseline.length > 0) return dedupNonEmpty(fromBaseline);
        return dedupNonEmpty((currentPreparedPpe ?? []).map((p) => p.content));
      })();

      setStructured((prev) => {
        const next: StructuredChecklist = { ...prev };
        next.attendance_confirmed = true;
        if (!next.work_summary) {
          const parts = [
            currentWorkTypeLabel ?? currentWorkTypeId,
            currentPreparedContext?.special_notes,
          ].filter(Boolean) as string[];
          if (parts.length) next.work_summary = parts.join(" — ");
        }
        if (
          (!next.hazards || next.hazards.length === 0) &&
          baselineArr.length > 0
        ) {
          next.hazards = dedupNonEmpty(baselineArr.map((b) => b.content));
        }
        if (
          (!next.risk_scenarios || next.risk_scenarios.length === 0) &&
          cbScen.length > 0
        ) {
          next.risk_scenarios = cbScen;
        }
        if (
          (!next.mitigations || next.mitigations.length === 0) &&
          cbMit.length > 0
        ) {
          next.mitigations = cbMit;
        }
        if ((!next.ppe || next.ppe.length === 0) && cbPpe.length > 0) {
          next.ppe = cbPpe;
        }
        return next;
      });

      // 2) attachment 저장.
      let signatureAttachmentId: string;
      try {
        signatureAttachmentId = await addAttachment(
          sessionId,
          result.blob,
          "image/png",
        );
      } catch (err) {
        console.error("[handleAttestationConfirmed] addAttachment failed:", err);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "[안내] 서명 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
          },
        ]);
        return;
      }

      // 3) leader_attestation stamp + putSession.
      // attachment_type="leader_attestation"을 attachments 메타에도 남기려면
      // session.attachments[]에 신규 항목을 push해야 하나, attachments는 사진
      // 분석 흐름의 owner state라 책임 분리 우선 — attachmentStore record는
      // session_id로 추적 가능, 별도 메타 추가는 옵셔널. 본 PR은 메타 push 생략
      // (leader_attestation.signature_attachment_id로 직접 lookup 가능).
      const attestation: LeaderAttestation = {
        signature_attachment_id: signatureAttachmentId,
        signed_at: nowIso,
        worker_count_attested: currentPreparedContext?.worker_count ?? 1,
        method: result.method,
      };

      try {
        const latest = await getSession(sessionId);
        if (latest) {
          await putSession({
            ...latest,
            leader_attestation: attestation,
          });
        }
      } catch (err) {
        console.error("[handleAttestationConfirmed] putSession failed:", err);
        // 저장 실패 — UI 흐름은 진행. 다음 단계에서 PDF 생성 useEffect가 getSession으로
        // 다시 읽을 때 leader_attestation이 없으면 안내 메시지로 막힘.
      }

      // 4) chat 시스템 메시지로 흔적 + 모달 전환.
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "✅ 리더 서명을 기록했습니다. 전파 확인서를 생성하는 중…",
        },
      ]);
      setAttestationModalOpen(false);
      setReportPreviewOpen(true);
    },
    [
      sessionId,
      setChecklist,
      setStructured,
      setMessages,
      currentWorkTypeLabel,
      currentWorkTypeId,
      currentPreparedContext,
      currentPreparedBaseline,
      currentPreparedScenarios,
      currentPreparedMitigations,
      currentPreparedPpe,
    ],
  );

  // ── Phase 2.x PR-6 — PDF 생성 useEffect ─────────────────────────
  // reportPreviewOpen=true가 되면 PDF 생성. blob이 이미 있으면 skip.
  // session.leader_attestation은 handleAttestationConfirmed가 putSession으로
  // 영속한 직후라 getSession으로 다시 읽어 옴(VoiceShell state는 leader_attestation
  // 영속 owner가 아님).
  useEffect(() => {
    if (!reportPreviewOpen) return;
    if (reportPdfBlob) return;
    if (!sessionId) return;
    let cancelled = false;
    setReportError(null);
    void (async () => {
      try {
        const sess = await getSession(sessionId);
        if (cancelled) return;
        if (!sess?.leader_attestation) {
          setReportError("리더 서명 정보를 찾을 수 없습니다.");
          return;
        }
        const sigId = sess.leader_attestation.signature_attachment_id;
        const sigBlob = await getAttachmentBlob(sigId);
        if (cancelled) return;
        if (!sigBlob) {
          setReportError("서명 이미지를 찾을 수 없습니다.");
          return;
        }
        const pdf = await generateBroadcastReportPdf(
          sess,
          sess.leader_attestation,
          sigBlob,
        );
        if (cancelled) return;
        const filename = buildBroadcastReportFilename(sess);
        setReportPdfBlob(pdf);
        setReportFilename(filename);
      } catch (err) {
        if (cancelled) return;
        console.error("[generateBroadcastReportPdf] failed:", err);
        setReportError(err instanceof Error ? err.message : "PDF 생성 실패");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportPreviewOpen, reportPdfBlob, sessionId]);

  // ── Phase 2.x PR-6 — handlePdfDownload ──────────────────────────
  // 사용자가 미리보기 모달 "다운로드" 탭. 다음을 순차 처리:
  //   1) triggerDownload — Blob을 a.click()으로 OS 다운로드.
  //   2) report blob을 attachments store에 저장 + session.broadcast_report_id stamp.
  //   3) status=confirmed + archiveSession (felix Q3=A 즉시 archive).
  //   4) 모달 닫기 + chat 메시지 + Home navigate (500ms 지연 — 다운로드 시작 후).
  const handlePdfDownload = useCallback(async () => {
    if (!reportPdfBlob || !sessionId) return;

    // 1) 다운로드 트리거.
    const filename = reportFilename || buildBroadcastReportFilename({
      session_id: sessionId,
      status: "draft",
      mode: "TBM",
      language: "korean",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
      checklist_items: [],
      prior_info: {},
      citations: [],
    });
    triggerDownload(reportPdfBlob, filename);

    // 2) report blob 저장 + session에 broadcast_report_id stamp.
    let reportId: string | null = null;
    try {
      reportId = await addAttachment(sessionId, reportPdfBlob, "application/pdf");
    } catch (err) {
      console.error("[handlePdfDownload] saveReport failed:", err);
    }

    // 3) status confirmed + archiveSession.
    try {
      const latest = await getSession(sessionId);
      if (latest) {
        const nextSession = {
          ...latest,
          status: "confirmed" as const,
          ...(reportId ? { broadcast_report_id: reportId } : {}),
        };
        await putSession(nextSession);
        // felix Q3=A — 즉시 archive.
        await archiveSession(sessionId);
      }
    } catch (err) {
      console.error("[handlePdfDownload] archive failed:", err);
    }

    // 4) 모달 닫기 + chat 메시지 + Home navigate.
    setReportPreviewOpen(false);
    setReportPdfBlob(null);
    setReportFilename("");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: "✅ 전파 확인서를 다운로드했습니다. 세션을 보관함에 저장합니다.",
      },
    ]);
    // 세션 active면 정지(상태 보존 X — confirmed 상태로 영속 완료).
    if (session.sessionActive) {
      session.stopSessionPreserveState();
    }
    setTimeout(() => navigate("/"), 500);
  }, [
    reportPdfBlob,
    reportFilename,
    sessionId,
    setMessages,
    session,
    navigate,
  ]);

  // PR F: CTA 노출 조건 — TBM 모드 + prepare 단계 데이터가 한 가지라도 있을 때.
  const showBroadcastCta =
    currentMode === "TBM" &&
    ((currentPreparedBaseline?.length ?? 0) > 0 ||
      (currentPreparedScenarios?.length ?? 0) > 0 ||
      (currentPreparedMitigations?.length ?? 0) > 0 ||
      (currentPreparedPpe?.length ?? 0) > 0);

  return (
    <div
      className="w-full h-full flex flex-col bg-pwc-bg-soft text-pwc-ink p-0 overflow-hidden"
      style={{ height: "100dvh", width: "100vw", position: "fixed", top: 0, left: 0 }}
    >
      <audio ref={audioRef} autoPlay hidden />

      <VoiceTopBar
        sessionActive={session.sessionActive}
        connecting={session.connecting}
        talking={talking}
        currentMode={currentMode}
        currentLanguage={currentLanguage}
        showLanguageSelector={showLanguageSelector}
        setShowLanguageSelector={setShowLanguageSelector}
        // Phase chat-PR3: 채팅 모드 chip 표시.
        transport={transport}
        onClickStart={() => session.startSession(null, null, { preparedSummary })}
        onClickStop={session.stopSession}
        onLeaveToHome={session.stopSessionPreserveState}
        onSwitchMode={(newMode) => {
          if (newMode === currentMode) return;
          // 2026-05-07 felix HITL — ModeSwitcher 클릭 시 단순 mode 토글이 아니라
          // **HomeScreen 시작 흐름과 동일한 라우팅**으로 진입한다. 같은 URL에 머물면
          // EHS chat에서 TBM 토글 시 currentMode만 "TBM"으로 바뀌고 URL은 /ehs/:id —
          // 새 TBM 시작과 다른 어색한 상태가 된다.
          //   TBM 진입: HomeScreen.startNewTbm 동일 — default domain 있으면 새 TBM
          //     세션 즉시 생성 + /tbm/:id/prepare. 없으면 홈으로 + 도메인 sheet auto-open.
          //   EHS 진입: HomeScreen.startNewEhs 동일 — 새 EHS 세션 + /ehs/:id.
          // 진행 중 WebRTC 세션은 stopSessionPreserveState로 정리(IndexedDB 자동저장은
          // useSessionPersistence가 처리). 새 라우트 mount에서 fresh hydrate.
          if (session.sessionActive) {
            const ok = window.confirm(
              "모드 변경 시 음성 세션이 재시작되고 진행 중인 대화·체크리스트가 초기화됩니다. 계속할까요?",
            );
            if (!ok) return;
          }
          if (session.sessionActive || session.connecting) {
            session.stopSessionPreserveState();
          }
          void (async () => {
            if (newMode === "TBM") {
              // HomeScreen.readDefaultDomain과 동일한 키. 영속 view-only 정책(invariant #10).
              let defaultDomain: SessionDomain | undefined;
              try {
                const v = localStorage.getItem("safemate.ui.defaultDomain");
                if (
                  v === "manufacturing" ||
                  v === "construction" ||
                  v === "heavy_industry" ||
                  v === "semiconductor"
                ) {
                  defaultDomain = v;
                }
              } catch {
                // localStorage 비활성 — 홈으로 fallback.
              }
              if (defaultDomain) {
                const s = createEmptySession(
                  "TBM",
                  currentLanguage,
                  undefined,
                  { domain: defaultDomain },
                );
                await putSession(s);
                navigate(`/tbm/${s.session_id}/prepare`);
              } else {
                // 기본 도메인 미설정 — 홈으로 가면서 sheet 자동 open 플래그 set.
                // HomeScreen mount useEffect가 읽어 setShowDomainSheet(true).
                try {
                  sessionStorage.setItem(
                    "safemate.ui.openDomainSheetOnce",
                    "1",
                  );
                } catch {
                  // sessionStorage 비활성 — 사용자가 홈에서 직접 클릭.
                }
                navigate("/");
              }
            } else {
              // EHS 진입 — HomeScreen.startNewEhs와 동일.
              const s = createEmptySession("EHS", currentLanguage);
              await putSession(s);
              navigate(`/ehs/${s.session_id}`);
            }
          })();
        }}
        onSelectLanguage={(lang) => {
          if (lang === currentLanguage) {
            setShowLanguageSelector(false);
            return;
          }
          if (session.sessionActive) {
            const ok = window.confirm(
              "언어 변경 시 음성 세션이 재시작됩니다. 진행 중인 대화 내용은 유지됩니다. 계속할까요?",
            );
            if (!ok) {
              setShowLanguageSelector(false);
              return;
            }
            session.stopSessionPreserveState();
          }
          setCurrentLanguage(lang);
          setShowLanguageSelector(false);
        }}
        rightSlot={
          // 2026-05-06 mobile fix — 모바일은 "정리본" 텍스트 숨김(아이콘+%만), 종료 버튼은 텍스트 유지(중요 액션).
          // 2026-05-07 felix HITL — EHS는 정리본/FinishScreen 흐름이 없으므로 정리본 버튼 미렌더 + 종료는 홈으로 navigate.
          //   TBM 종료(→ /tbm/:id/finish, 참석자·서명·PDF)와 EHS 종료(→ /, Q&A 모드 종료)는 의미가 달라 분기 필요.
          //   FinishScreen은 TBM 흐름 전용이라 EHS 세션이 진입하면 데이터 모델 불일치 + UX 혼란.
          currentMode === "TBM" ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setShowSummaryDrawer(true)}
                className="flex items-center gap-1 sm:gap-2 bg-white text-pwc-ink px-2 sm:px-3 py-1.5 rounded-pwc text-[11px] font-bold uppercase tracking-wider border border-pwc-border-strong hover:border-pwc-orange hover:text-pwc-orange transition whitespace-nowrap"
                aria-label={`정리본 보기 (${structuredProgressPercent}%)`}
              >
                <IconDoc size={14} />
                <span className="hidden sm:inline">정리본</span>
                <span className="text-pwc-orange">{structuredProgressPercent}%</span>
              </button>
              {/* PR D — TBM 종료 → FinishScreen. 진행 중 세션은 stopSessionPreserveState로 정리. */}
              {sessionId && (
                <button
                  onClick={() => {
                    // 세션 active면 정지(상태 보존). hook의 debounced auto-save가 처리.
                    if (session.sessionActive) {
                      session.stopSessionPreserveState();
                    }
                    navigate(`/tbm/${sessionId}/finish`);
                  }}
                  className="flex items-center gap-2 bg-pwc-orange text-white px-2 sm:px-3 py-1.5 rounded-pwc text-[11px] font-bold uppercase tracking-wider border border-pwc-orange hover:bg-pwc-orange-deep transition whitespace-nowrap"
                  aria-label="TBM 종료 화면으로"
                  title="TBM 종료 — 참석자·서명·리포트"
                >
                  종료
                </button>
              )}
            </div>
          ) : (
            // EHS — 종료 버튼만(홈 navigate). FinishScreen 진입 금지.
            <div className="flex items-center">
              <button
                onClick={() => {
                  if (session.sessionActive || session.connecting) {
                    const ok = window.confirm(
                      "EHS 안전 질문하기를 종료하고 홈으로 이동합니다. 계속할까요?",
                    );
                    if (!ok) return;
                    session.stopSessionPreserveState();
                  }
                  navigate("/");
                }}
                className="flex items-center gap-2 bg-pwc-orange text-white px-2 sm:px-3 py-1.5 rounded-pwc text-[11px] font-bold uppercase tracking-wider border border-pwc-orange hover:bg-pwc-orange-deep transition whitespace-nowrap"
                aria-label="EHS 종료 — 홈으로"
                title="EHS 안전 질문하기 종료 — 홈 화면으로 돌아갑니다"
              >
                종료
              </button>
            </div>
          )
        }
      />

      {/* PR B (c6 §3.VII) — TBM 단계 stepper. EHS 모드는 미렌더 — ProgressStack과
           동일 가드. 클릭 시 ChecklistPanel/SummaryDrawer 토글 매핑. */}
      {currentMode === "TBM" && (
        <StagesStrip
          currentStage={currentStage}
          onClickStage={handleClickStage}
        />
      )}

      {/* Phase 2.x PR-4/PR-5 — BroadcastCompleteCTA + AttestationModal.
           PR-4: readiness 게이트 + 펄스 CTA.
           PR-5: 클릭 시 풀스크린 AttestationModal open (이전엔 즉시 confirm + /finish).
           - 비활성: 누락 항목 카운터 ("체크리스트 N개 · 대응/예방 · 참석 미확인")
           - 활성: PwC orange + "📢 작업자 N명에게 전파 완료"
           - 펄스: LLM이 request_broadcast_attestation 호출 시 30초간 ring + animate-pulse
           prepare 데이터가 하나라도 있을 때만 노출. EHS / legacy 세션 누출 0. */}
      {showBroadcastCta && (
        <BroadcastCompleteCTA
          readiness={broadcastReadiness}
          pulsing={broadcastPulsing}
          workerCount={currentPreparedContext?.worker_count}
          onClick={() => {
            // 비활성 상태에선 disabled button이라 onClick 자체가 호출 안 됨.
            // 방어적으로 readiness 재검사 후 진입.
            if (!broadcastReadiness.isReady) return;
            setAttestationModalOpen(true);
          }}
        />
      )}

      <ProgressStack
        currentMode={currentMode}
        structuredProgressPercent={structuredProgressPercent}
        completedCount={completedCount}
        totalCount={checklist.length}
        progressPercent={progressPercent}
        showChecklistPanel={showChecklistPanel}
        onTogglePanel={() => setShowChecklistPanel((v) => !v)}
      />

      <ChatList
        messages={messages}
        currentMode={currentMode}
        talking={talking}
        connecting={session.connecting}
        sessionActive={session.sessionActive}
        cueMessage={cueMessage}
        citations={citations}
        onClearCitations={() => setCitations([])}
        showRecommendedChips={recommended.showRecommendedQuestions}
        recommendedQuestions={recommended.displayedQuestions}
        recommendedAnimatingOut={recommended.animatingOut}
        onClickRecommendedQuestion={handleClickRecommendedQuestion}
        onRecommendedHoverChange={setRecommendedHovered}
        onRotateRecommended={recommended.rotateNow}
        attachments={currentAttachments}
        hazardDetections={currentHazardDetections}
        onAddDetectionToStructured={
          currentMode === "TBM" ? handleAddDetectionToStructured : undefined
        }
        onUndoDetectionFromStructured={
          currentMode === "TBM" ? handleUndoDetectionFromStructured : undefined
        }
        // Phase chat-PR3: 메시지 actions 클릭 핸들러.
        onMessageAction={handleMessageAction}
      />

      {/* PR B+ NEW-H4: 자동 시작 후 마이크 OFF default — 첫 임프레션에 토글 위치 안내.
           localStorage로 영구 dismiss(invariant #10 — `safemate.ui.*` 네임스페이스).
           Phase chat-PR3: chat 모드에선 마이크 안내 무의미 → 숨김. */}
      {transport === "voice" && micHintVisible && !micEnabled && (
        <div className="px-3 pb-2 shrink-0">
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 px-3 py-2 rounded-pwc bg-pwc-orange-wash border border-pwc-orange/30 text-[12px] text-pwc-ink"
          >
            <span aria-hidden="true" className="shrink-0">🎙️</span>
            <div className="flex-1 leading-snug">
              <span className="font-semibold">마이크 켜기</span> — 음성으로 대화하려면
              아래 좌측 마이크 버튼을 눌러주세요.
            </div>
            <button
              type="button"
              onClick={dismissMicHint}
              className="shrink-0 text-pwc-ink-soft hover:text-pwc-orange-deep text-[11px] font-semibold px-1"
              aria-label="마이크 안내 닫기"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <InputDock
        input={input}
        setInput={setInput}
        setIsInputFocused={setIsInputFocused}
        sendTextMessage={() =>
          void session.sendTextMessage(
            input,
            talking,
            () => setInput(""),
            events.logRetrieveForUserMessage,
          )
        }
        talking={talking}
        sessionRef={sessionRef}
        micEnabled={micEnabled}
        onToggleMic={handleToggleMic}
        // 세션 active이거나 비active(권한 거부 후 재시도용 startSession)이면 클릭 가능.
        // connecting 중일 때만 비활성. chat 모드에선 항상 클릭 가능 (재시도 트리거).
        canToggleMic={transport === "chat" || !session.connecting}
        // FIX (felix HITL "음성대화 시작 반응이 느려"): connecting 시각화.
        // 자동시작은 hydrated 후 발동되며 getUserMedia + WebRTC + ephemeral key
        // + OpenAI POST가 sequential ~3-5초 소요. 사용자 인지 latency를 줄이려고
        // 마이크 버튼에 spinner + "연결 중" tooltip을 명시.
        connecting={session.connecting}
        // Phase chat-PR3: chat 폴백 트랜스포트면 마이크 버튼이 "음성 모드 시도"
        // 로 라벨 변경되고 클릭 시 handleRetryVoice 호출.
        chatTransport={transport === "chat"}
        currentLanguage={currentLanguage}
        // PR C — 카메라 노출 + 사진 캡처 핸들러.
        currentDomain={currentDomain}
        onPhotoCaptured={handlePhotoCaptured}
      />

      <Portal>
        <SummaryDrawer
          open={showSummaryDrawer && currentMode === "TBM"}
          onClose={() => setShowSummaryDrawer(false)}
          structured={structured}
          finalSummary={finalSummary}
          structuredProgressPercent={structuredProgressPercent}
          hazardSuggestions={hazardSuggestions}
          onClearHazardSuggestions={() => setHazardSuggestions([])}
          checklist={checklist}
          preparedHazards={currentPreparedHazards}
        />
      </Portal>

      <Portal>
        <InterruptionToast
          show={interruption.showInterruption}
          message={interruption.interruptionMessage}
          onDismiss={interruption.dismissInterruption}
        />
      </Portal>

      <Portal>
        {currentMode === "TBM" && showChecklistPanel && (
          <ChecklistPanel
            show={true}
            onClose={() => setShowChecklistPanel(false)}
            checklist={checklist}
            setChecklist={setChecklist}
            priorInfo={priorInfo}
            completedCount={completedCount}
            sessionRef={sessionRef}
          />
        )}
      </Portal>

      {/* Phase 2.x PR-5 — AttestationModal. CTA 클릭 시 open. */}
      <Portal>
        <AttestationModal
          open={attestationModalOpen}
          workerCount={currentPreparedContext?.worker_count ?? 1}
          workTypeLabel={currentWorkTypeLabel ?? currentWorkTypeId ?? ""}
          hazardsSummary={(currentPreparedBaseline ?? [])
            .slice(0, 3)
            .map((b) => b.content)}
          onConfirm={handleAttestationConfirmed}
          onCancel={() => setAttestationModalOpen(false)}
        />
      </Portal>

      {/* Phase 2.x PR-6 — ReportPreviewModal. attestation confirm 직후 open + PDF 생성. */}
      <Portal>
        <ReportPreviewModal
          open={reportPreviewOpen}
          pdfBlob={reportPdfBlob}
          filename={reportFilename}
          onDownload={handlePdfDownload}
          onClose={() => {
            setReportPreviewOpen(false);
            setReportPdfBlob(null);
            setReportFilename("");
            setReportError(null);
          }}
        />
      </Portal>
      {/* PR-6 — PDF 생성 실패 시 chat에 1회 안내. (간단 useEffect로 처리.) */}
      {reportError && reportPreviewOpen && (
        <Portal>
          <div
            className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-pwc bg-pwc-orange text-white text-sm font-semibold shadow-pwc"
            style={{ zIndex: 31, top: "12vh" }}
            role="alert"
          >
            {reportError}
          </div>
        </Portal>
      )}
    </div>
  );
}
