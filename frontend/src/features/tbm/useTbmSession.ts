// useTbmSession — App.tsx L813-873, L921-999 이전.
// PR 1 한정: 동작 변경 0. PR 3에서 stopSessionPreserveState + switchMode 상태 리셋 제거.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction, MutableRefObject, RefObject } from "react";
import { WebRTCSession, type PreparedSummary } from "../../services/webrtc";
import { DEFAULT_CHECKLIST, type ChecklistItem } from "../../services/checklist";
import type {
  StructuredChecklist,
  PermitRecord,
  SessionDomain,
  SessionLanguage,
} from "../../services/sessionModel";
import type {
  ChatMessage,
  CitationDisplay,
  PriorInformation,
  AppMode,
} from "./types";
import { getInitialCueMessage } from "../../shared/i18n/cueMessages";

export interface UseTbmSessionOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  sessionRef: MutableRefObject<WebRTCSession | null>;
  currentMode: AppMode;
  currentLanguage: SessionLanguage;
  currentDomain: SessionDomain | undefined;
  /** PR A: optional work_type_id selected on PrepareScreen. */
  currentWorkTypeId?: string;
  setCurrentMode: Dispatch<SetStateAction<AppMode>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChecklist: Dispatch<SetStateAction<ChecklistItem[]>>;
  setPriorInfo: Dispatch<SetStateAction<PriorInformation>>;
  setCitations: Dispatch<SetStateAction<CitationDisplay[]>>;
  setStructured: Dispatch<SetStateAction<StructuredChecklist>>;
  setHazardSuggestions: Dispatch<
    SetStateAction<{ hazard: string; rationale: string }[]>
  >;
  setFinalSummary: Dispatch<SetStateAction<string>>;
  setPermits: Dispatch<SetStateAction<PermitRecord[]>>;
  setCueMessage: Dispatch<SetStateAction<string>>;
  // PR B+ Cleanup (felix lock §6 Q7+Q16):
  //   `setShowChatLog` 제거 — ChatLogPanel(c2) 폐기. VoiceShell이 더미 setter 주입했으나
  //   shell 더미 + 본 옵션 + switchMode 호출까지 모두 dead path였음.
  setShowLanguageSelector: Dispatch<SetStateAction<boolean>>;
  /** talking 상태는 shell이 owner — events와 공유 */
  setTalking: Dispatch<SetStateAction<"idle" | "user" | "assistant">>;
  dismissInterruption: () => void;
  onEvent: (event: unknown) => void;
  resetRecommendedQuestions: () => void;
  /** Phase chat-PR2: voice 세션 시작이 실패했을 때 shell 이 chat 트랜스포트로
   *  전환하기 위한 콜백. micError set 과 동시에 호출된다. 미주입이어도 기존
   *  voice 단독 동작은 그대로 유지(콜백 호출은 옵셔널). */
  onConnectionFailed?: (
    kind: "auth_quota" | "network",
    message: string,
  ) => void;
}

export interface StartSessionOptions {
  /** Cycle 3: 자동 시작 시 마이크 트랙은 OFF로 시작. 사용자가 토글로 ON. */
  micInitiallyEnabled?: boolean;
  /** PR A_v2-4: prepare-stage summary for [Prepare Stage Result] inject.
   *  TBM-only on the backend; EHS sessions ignore this. */
  preparedSummary?: PreparedSummary;
}

export interface UseTbmSessionResult {
  sessionActive: boolean;
  connecting: boolean;
  /** Cycle 3: 마이크 권한 요청 실패(NotAllowedError 등). UI에 표시. */
  micError: string | null;
  clearMicError: () => void;
  startSession: (
    initialMessage: string | null,
    initialMessageRole: "user" | "assistant" | "system" | null,
    opts?: StartSessionOptions,
  ) => Promise<void>;
  /** 신규 세션 시작 전용 — 모든 누적 상태를 리셋. */
  stopSession: () => void;
  /** PR 3: 언어 변경 등에서 RTC만 정지하고 누적 상태(messages/checklist/priorInfo/citations)는 보존. */
  stopSessionPreserveState: () => void;
  switchMode: (newMode: AppMode) => void;
  /** 텍스트 입력 전송 — App.tsx L921-970 */
  sendTextMessage: (
    input: string,
    talking: "idle" | "user" | "assistant",
    onSent: () => void,
    logRetrieveForUserMessage: (msg: string) => Promise<void>,
  ) => Promise<void>;
}

export function useTbmSession(opts: UseTbmSessionOptions): UseTbmSessionResult {
  const {
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
    setTalking,
    dismissInterruption,
    onEvent,
    resetRecommendedQuestions,
    onConnectionFailed,
  } = opts;

  const [sessionActive, setSessionActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Cycle 3: 마이크 권한 거부/장치 오류 메시지. shell에서 toast/system 메시지로 표시.
  const [micError, setMicError] = useState<string | null>(null);
  const clearMicError = useCallback(() => setMicError(null), []);
  // 최신 mode/language/domain/work_type을 start 콜백 안에서 안전하게 읽기 위한 ref
  const modeRef = useRef(currentMode);
  const langRef = useRef(currentLanguage);
  const domainRef = useRef(currentDomain);
  const workTypeRef = useRef(currentWorkTypeId);
  // onEvent ref-thunk: 호출자가 매번 새 함수를 넘겨도 startSession이 재생성되지 않도록.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    modeRef.current = currentMode;
  }, [currentMode]);
  useEffect(() => {
    langRef.current = currentLanguage;
  }, [currentLanguage]);
  useEffect(() => {
    domainRef.current = currentDomain;
  }, [currentDomain]);
  useEffect(() => {
    workTypeRef.current = currentWorkTypeId;
  }, [currentWorkTypeId]);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // App.tsx L813-854 + Cycle 3: micInitiallyEnabled 옵션, 권한 거부 폴백.
  const startSession = useCallback(
    async (
      initialMessage: string | null,
      initialMessageRole: "user" | "assistant" | "system" | null,
      startOpts?: StartSessionOptions,
    ) => {
      if (sessionActive || connecting) return;

      setConnecting(true);
      setMicError(null);
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setConnecting(false);
        const name = (err as { name?: string }).name ?? "";
        const msg =
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "마이크 권한이 거부되어 음성 세션을 시작할 수 없습니다. 브라우저 설정에서 권한을 허용한 뒤 다시 시도하세요."
            : "마이크 장치에 접근할 수 없습니다. 다른 앱이 사용 중이거나 장치가 연결되어 있는지 확인하세요.";
        setMicError(msg);
        return;
      }

      // Cycle 3: 자동 시작 시 mic 트랙은 OFF로 시작. 사용자가 InputDock 토글로 ON.
      const micInitiallyEnabled = startOpts?.micInitiallyEnabled ?? true;
      if (!micInitiallyEnabled) {
        micStream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }

      const session = new WebRTCSession({
        onSessionEnd: () => {
          setSessionActive(false);
          setTalking("idle");
        },
        onEvent: (e) => onEventRef.current(e),
        mode: modeRef.current === "TBM" ? "tbm" : "ehs",
        language: langRef.current,
        domain: domainRef.current,
        // PR A: pass through to backend prompt builder. Undefined => unchanged behavior.
        work_type_id: workTypeRef.current,
        // PR A_v2-4: TBM-only inject — webrtc.ts also gates by mode='tbm'.
        prepared_summary: startOpts?.preparedSummary,
      });

      sessionRef.current = session;
      // 2026-05-06 felix HITL — webrtc-key 실패 가시화.
      // 이전엔 await session.start가 try/catch 없이 noop 종료 → 사용자는 spinner만
      // 보고 끝. ephemeral key 401/429(quota), SDP 교환 실패, 네트워크 오류 모두
      // 같은 무음 증상으로 막혀 디버깅 불가했음.
      // 정책:
      //   - getEphemeralKey 단계 실패(`Failed to get ephemeral key` 메시지) →
      //     "음성 세션을 시작할 수 없습니다 — 잠시 후 다시 시도해주세요" 안내.
      //   - SDP 교환·기타 실패 → 같은 안내 + 콘솔 로깅으로 dev 디버깅.
      //   - 실패 시 sessionRef cleanup + connecting/active 모두 false 복구 →
      //     사용자가 마이크 토글로 재시도 가능.
      try {
        if (initialMessage && initialMessageRole) {
          await session.start(audioRef.current!, micStream, initialMessage, initialMessageRole);
        } else {
          await session.start(audioRef.current!, micStream);
        }
      } catch (err) {
        console.error("[useTbmSession] session.start failed:", err);
        // 마이크 트랙 정리 — 음소거된 채 stream이 떠 있으면 다음 호출 시 트랙 재사용 충돌.
        try {
          micStream.getTracks().forEach((t) => t.stop());
        } catch {
          // 이미 정리된 경우 무시.
        }
        sessionRef.current = null;
        setConnecting(false);
        setSessionActive(false);
        const raw = err instanceof Error ? err.message : String(err);
        const isAuthOrQuota =
          raw.includes("ephemeral key") ||
          raw.includes("401") ||
          raw.includes("429") ||
          raw.includes("insufficient_quota");
        const msg = isAuthOrQuota
          ? "음성 서비스에 일시적으로 접근할 수 없습니다 (서버 인증/한도). 잠시 후 다시 시도하거나 운영자에게 문의하세요."
          : "음성 세션 연결에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.";
        setMicError(msg);
        // Phase chat-PR2: shell 에 chat 폴백 신호. 콜백 미주입이면 voice 단독
        // 동작 유지(기존 회귀 0).
        onConnectionFailed?.(isAuthOrQuota ? "auth_quota" : "network", msg);
        return;
      }

      setSessionActive(true);
      // FIX (체크리스트 prefill 보존):
      // 이전 코드는 startSession 진입 시 messages/checklist/priorInfo/citations/cue를
      // 모두 초기 상태로 덮어썼다. 그 결과 PrepareScreen이 prefill한 baseline 자물쇠
      // 항목(checklist_items)이 자동시작 직후 빈 배열로 사라져 felix가 본 "체크리스트
      // 가 만들어지지 않아" 증상을 발생시켰다. hydrate가 이미 IndexedDB에서 정확한
      // 누적 상태를 set한 상태이므로 startSession이 추가로 리셋할 필요가 없다.
      // 신규 세션은 createEmptySession()이 모든 누적을 빈 상태로 만들어 두므로 hydrate
      // 시점에 자연히 빈 상태로 시작한다.
      dismissInterruption();

      setTimeout(() => {
        setConnecting(false);
      }, 2000);
    },
    [
      sessionActive,
      connecting,
      audioRef,
      sessionRef,
      setTalking,
      dismissInterruption,
    ],
  );

  // App.tsx L857-873 — 신규 세션 시작 전용. 모든 누적 상태 리셋.
  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    setSessionActive(false);
    setConnecting(false);
    setTalking("idle");
    setCueMessage(getInitialCueMessage(langRef.current));
    dismissInterruption();
    setPriorInfo({});
    setChecklist(DEFAULT_CHECKLIST);
    setMessages([]);
    setCitations([]);
  }, [
    sessionRef,
    setCueMessage,
    setTalking,
    dismissInterruption,
    setPriorInfo,
    setChecklist,
    setMessages,
    setCitations,
  ]);

  // PR 3: 언어 변경용 — RTC만 정지, 누적 상태 보존.
  // setMessages([])/setChecklist(DEFAULT_CHECKLIST)/setPriorInfo({})/setCitations([]) 호출하지 않음.
  const stopSessionPreserveState = useCallback(() => {
    sessionRef.current?.stop();
    setSessionActive(false);
    setConnecting(false);
    setTalking("idle");
    dismissInterruption();
  }, [sessionRef, setTalking, dismissInterruption]);

  // App.tsx L972-999 — PR 3 → PR I: 모드 전환 시 누적 상태 리셋 복원.
  // 배경: PR 3에서 "언어 변경 시 대화 보존" 의도로 리셋을 제거했으나, 같은 함수가
  //   모드 전환에도 호출돼 EHS Q&A가 TBM 세션에 그대로 흘러가는 문제가 있었다
  //   (felix HITL 진단). 언어 변경 경로(VoiceShell.onSelectLanguage)는
  //   stopSessionPreserveState만 호출하고 setCurrentLanguage 하므로 이 함수와
  //   분리되어 있다. 따라서 switchMode는 모드가 다른 경우에만 호출되며 리셋을
  //   안전하게 수행할 수 있다.
  // 정책:
  //   - newMode === modeRef.current → no-op (early return)
  //   - 모드 전환 → RTC 정지(상태 보존 헬퍼) + 모든 누적 상태 리셋
  //     (messages / checklist / priorInfo / citations / structured /
  //      hazardSuggestions / permits / finalSummary)
  //   - resetRecommendedQuestions 유지 — EHS↔TBM 전환 시 추천질문 재초기화 보장.
  const switchMode = useCallback(
    (newMode: AppMode) => {
      if (newMode === modeRef.current) return;
      if (sessionActive) {
        // ModeSwitcher가 disabled라 도달하지 않아야 하나 방어적으로 정지(RTC만).
        stopSessionPreserveState();
      }
      // PR B+ Cleanup: setShowChatLog(false) 호출 제거 — ChatLogPanel 폐기.
      setShowLanguageSelector(false);
      resetRecommendedQuestions();
      // PR I — 모드 전환은 도메인이 다른 흐름(EHS Q&A ↔ TBM 진행)이므로
      // 이전 모드의 누적 상태가 새 모드에 흘러가지 않도록 모두 초기화.
      setMessages([]);
      setChecklist(DEFAULT_CHECKLIST);
      setPriorInfo({});
      setCitations([]);
      setStructured({});
      setHazardSuggestions([]);
      setPermits([]);
      setFinalSummary("");
      setCueMessage(getInitialCueMessage(langRef.current));
      setCurrentMode(newMode);
    },
    [
      sessionActive,
      stopSessionPreserveState,
      setShowLanguageSelector,
      resetRecommendedQuestions,
      setMessages,
      setChecklist,
      setPriorInfo,
      setCitations,
      setStructured,
      setHazardSuggestions,
      setPermits,
      setFinalSummary,
      setCueMessage,
      setCurrentMode,
    ],
  );

  // App.tsx L921-970
  const sendTextMessage = useCallback(
    async (
      input: string,
      talkingState: "idle" | "user" | "assistant",
      onSent: () => void,
      logRetrieveForUserMessage: (msg: string) => Promise<void>,
    ) => {
      if (!input.trim()) return;
      const userMessage = input.trim();
      if (!sessionActive) {
        await startSession(userMessage, "user");
        onSent();
        return;
      }
      if (talkingState === "assistant" && sessionRef.current) {
        sessionRef.current.interruptResponse();
      }
      setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
      setTalking("user");
      if (modeRef.current === "EHS") {
        await logRetrieveForUserMessage(userMessage);
      }
      sessionRef.current?.sendTextMessage(userMessage, "user", false);
      onSent();
    },
    [sessionActive, startSession, setMessages, setTalking, sessionRef],
  );

  return {
    sessionActive,
    connecting,
    micError,
    clearMicError,
    startSession,
    stopSession,
    stopSessionPreserveState,
    switchMode,
    sendTextMessage,
  };
}
