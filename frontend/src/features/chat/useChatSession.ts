// Phase chat-PR2: 채팅 전용 세션 훅. WebRTC 연결이 실패하거나 사용자가 명시
// 적으로 채팅 모드를 선택했을 때 useTbmSession 자리에 swap 되어 동작한다.
// 시그니처는 useTbmSession 의 UseTbmSessionResult 와 호환되도록 구성하며,
// 추가 메서드 requestInitialBriefing 만 별도로 노출한다(VoiceShell 이 자동
// 폴백 직후 1회 호출).
//
// 백엔드 계약: POST /api/chat — SSE 스트리밍.
//   요청 body: { mode, language, domain?, work_type_id?, prepared_summary?, messages: [{role, content}] }
//   응답 이벤트: event: delta | done | error  (data: 각 JSON)
//   에러 코드: bad_request | openai_timeout | openai_rate_limit
//             | openai_unavailable | openai_auth | internal
//
// 본 훅은 voice 의존성이 일절 없다 — getUserMedia / RTCPeerConnection 미사용.
// 회사망에서 OpenAI Realtime UDP/SDP 가 차단된 환경에서도 동작 가능.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_CHECKLIST, type ChecklistItem } from "../../services/checklist";
import type {
  StructuredChecklist,
  PermitRecord,
  SessionDomain,
  SessionLanguage,
} from "../../services/sessionModel";
import type { PreparedSummary } from "../../services/webrtc";
import type {
  ChatMessage,
  CitationDisplay,
  PriorInformation,
  AppMode,
} from "../tbm/types";
import type {
  UseTbmSessionResult,
  StartSessionOptions,
} from "../tbm/useTbmSession";
import { getInitialCueMessage } from "../../shared/i18n/cueMessages";

export interface UseChatSessionOptions {
  currentMode: AppMode;
  currentLanguage: SessionLanguage;
  currentDomain: SessionDomain | undefined;
  currentWorkTypeId?: string;
  /** preparedSummary 는 VoiceShell 이 매 렌더 derive 하므로 매 호출마다 최신값을
   *  전달받기 위해 prop 으로 주입. */
  preparedSummary?: PreparedSummary;
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
  setShowLanguageSelector: Dispatch<SetStateAction<boolean>>;
  setTalking: Dispatch<SetStateAction<"idle" | "user" | "assistant">>;
  dismissInterruption: () => void;
  resetRecommendedQuestions: () => void;
}

export interface UseChatSessionResult extends UseTbmSessionResult {
  /** TBM 자동 폴백 직후 prepared_summary 가 있을 때 자동 브리핑을 1회 트리거.
   *  EHS / 미준비 세션은 noop. */
  requestInitialBriefing: () => Promise<void>;
}

/** 사용자 첫 입력 없이 자동 브리핑을 요청할 때 보낼 user-role 트리거 카피.
 *  prompt.py 의 [Prepare Stage Result] 블록을 LLM 이 그대로 활용. */
function chatModeBriefingTrigger(lang: SessionLanguage): string {
  switch (lang) {
    case "english":
      return "Please start today's safety briefing based on the prepare-stage result.";
    case "vietnamese":
      return "Vui lòng bắt đầu phần tóm tắt an toàn dựa trên kết quả giai đoạn chuẩn bị.";
    case "thai":
      return "โปรดเริ่มสรุปความปลอดภัยของวันนี้โดยอิงจากผลการเตรียมการ";
    case "indonesian":
      return "Silakan mulai briefing keselamatan hari ini berdasarkan hasil tahap persiapan.";
    case "korean":
    default:
      return "준비 단계 결과를 바탕으로 오늘 작업 안전 브리핑을 시작해 주세요.";
  }
}

/** 백엔드 SSE error 이벤트 또는 네트워크 실패 시 사용자에게 보일 폴백 카피. */
function chatErrorFallback(lang: SessionLanguage): string {
  switch (lang) {
    case "english":
      return "[Notice] Failed to receive a response from the server. Please try again in a moment.";
    case "vietnamese":
      return "[Thông báo] Không nhận được phản hồi từ máy chủ. Vui lòng thử lại sau.";
    case "thai":
      return "[แจ้งเตือน] ไม่สามารถรับการตอบกลับจากเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้งในอีกสักครู่";
    case "indonesian":
      return "[Pemberitahuan] Tidak dapat menerima respons dari server. Silakan coba lagi sebentar.";
    case "korean":
    default:
      return "[안내] 서버 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

interface SseEvent {
  event: string;
  data: unknown;
}

/** ReadableStream 에서 SSE 블록을 비동기 yield. `\n\n` 으로 블록 분리. */
async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      let event = "message";
      const dataLines: string[] = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!dataLines.length) continue;
      const dataStr = dataLines.join("\n");
      let data: unknown = dataStr;
      try {
        data = JSON.parse(dataStr);
      } catch {
        // raw 문자열 그대로 전달.
      }
      yield { event, data };
    }
  }
}

export function useChatSession(
  opts: UseChatSessionOptions,
): UseChatSessionResult {
  const {
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
    dismissInterruption,
    resetRecommendedQuestions,
  } = opts;

  const [connecting, setConnecting] = useState(false);

  const modeRef = useRef(currentMode);
  const langRef = useRef(currentLanguage);
  const domainRef = useRef(currentDomain);
  const workTypeRef = useRef(currentWorkTypeId);
  const preparedSummaryRef = useRef(preparedSummary);
  /** 누적 messages 의 최신 스냅샷 — sendTextMessage 안에서 race-free 하게 사용
   *  (state setter 의 함수형 업데이트만으로는 다음 fetch body 를 빌드하기에 부족). */
  const messagesRef = useRef<ChatMessage[]>([]);

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
    preparedSummaryRef.current = preparedSummary;
  }, [preparedSummary]);

  /** useChatSession 은 voice 와 달리 rerender 시점의 messages 를 모아 두지 않는다 —
   *  setMessages 가 functional updater 를 받을 때 prev 를 복사해 ref 에도 반영. */
  const syncMessagesRef = useCallback(
    (next: ChatMessage[]) => {
      messagesRef.current = next;
    },
    [],
  );

  const sendChatRequest = useCallback(
    async (assistantIdx: number) => {
      const body = {
        mode: modeRef.current === "TBM" ? "tbm" : "ehs",
        language: langRef.current,
        domain: domainRef.current,
        work_type_id: workTypeRef.current,
        prepared_summary: preparedSummaryRef.current,
        messages: messagesRef.current
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.text }))
          // 마지막 assistant placeholder(빈 text) 는 백엔드에 보내지 않는다.
          .filter((m, i, arr) => !(i === arr.length - 1 && m.role === "assistant" && m.content === "")),
      };

      let res: Response;
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // 네트워크 자체 실패 — placeholder 메시지를 안내로 교체.
        setMessages((prev) => {
          const next = [...prev];
          if (next[assistantIdx]) {
            next[assistantIdx] = {
              ...next[assistantIdx],
              text: chatErrorFallback(langRef.current),
            };
          }
          syncMessagesRef(next);
          return next;
        });
        return;
      }

      if (!res.ok || !res.body) {
        // 422 / 413 / 5xx — 안내 메시지로 교체.
        setMessages((prev) => {
          const next = [...prev];
          if (next[assistantIdx]) {
            next[assistantIdx] = {
              ...next[assistantIdx],
              text: chatErrorFallback(langRef.current),
            };
          }
          syncMessagesRef(next);
          return next;
        });
        return;
      }

      const reader = res.body.getReader();
      try {
        for await (const evt of parseSseStream(reader)) {
          if (evt.event === "delta") {
            const delta = (evt.data as { text?: string }).text ?? "";
            if (!delta) continue;
            setMessages((prev) => {
              const next = [...prev];
              const cur = next[assistantIdx];
              if (cur) {
                next[assistantIdx] = {
                  ...cur,
                  text: cur.text + delta,
                };
              }
              syncMessagesRef(next);
              return next;
            });
          } else if (evt.event === "done") {
            // 완료 — finally 에서 connecting/talking 정리.
          } else if (evt.event === "error") {
            const message =
              (evt.data as { message?: string }).message ??
              chatErrorFallback(langRef.current);
            setMessages((prev) => {
              const next = [...prev];
              const cur = next[assistantIdx];
              if (cur) {
                next[assistantIdx] = {
                  ...cur,
                  text: cur.text
                    ? `${cur.text}\n\n[안내] ${message}`
                    : `[안내] ${message}`,
                };
              }
              syncMessagesRef(next);
              return next;
            });
          }
        }
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          const cur = next[assistantIdx];
          if (cur) {
            next[assistantIdx] = {
              ...cur,
              text: cur.text
                ? `${cur.text}\n\n${chatErrorFallback(langRef.current)}`
                : chatErrorFallback(langRef.current),
            };
          }
          syncMessagesRef(next);
          return next;
        });
      }
    },
    [setMessages, syncMessagesRef],
  );

  const sendTextMessage = useCallback(
    async (
      input: string,
      _talkingState: "idle" | "user" | "assistant",
      onSent: () => void,
      logRetrieveForUserMessage: (msg: string) => Promise<void>,
    ): Promise<void> => {
      if (!input.trim()) return;
      const userMessage = input.trim();

      // 1) user 메시지 push.
      let assistantIdx = -1;
      setMessages((prev) => {
        const withUser: ChatMessage[] = [
          ...prev,
          { role: "user", text: userMessage },
        ];
        const withPlaceholder: ChatMessage[] = [
          ...withUser,
          { role: "assistant", text: "" },
        ];
        assistantIdx = withPlaceholder.length - 1;
        syncMessagesRef(withPlaceholder);
        return withPlaceholder;
      });
      setTalking("assistant");
      setConnecting(true);
      onSent();

      // EHS 모드는 voice 와 동등하게 retrieve 호출 — citations 표시는 그대로 활용.
      if (modeRef.current === "EHS") {
        try {
          await logRetrieveForUserMessage(userMessage);
        } catch {
          // citations 실패해도 chat 응답은 별도로 진행.
        }
      }

      try {
        await sendChatRequest(assistantIdx);
      } finally {
        setConnecting(false);
        setTalking("idle");
      }
    },
    [sendChatRequest, setMessages, setTalking, syncMessagesRef],
  );

  const startSession = useCallback(
    async (
      initialMessage: string | null,
      initialMessageRole: "user" | "assistant" | "system" | null,
      _opts?: StartSessionOptions,
    ): Promise<void> => {
      if (!initialMessage || initialMessageRole !== "user") return;
      // initialMessage 가 user 면 sendTextMessage 와 동일 흐름.
      await sendTextMessage(
        initialMessage,
        "idle",
        () => {},
        async () => {},
      );
    },
    [sendTextMessage],
  );

  const stopSession = useCallback((): void => {
    setConnecting(false);
    setTalking("idle");
    setCueMessage(getInitialCueMessage(langRef.current));
    dismissInterruption();
    setPriorInfo({});
    setChecklist(DEFAULT_CHECKLIST);
    setMessages([]);
    setCitations([]);
    syncMessagesRef([]);
  }, [
    setTalking,
    setCueMessage,
    dismissInterruption,
    setPriorInfo,
    setChecklist,
    setMessages,
    setCitations,
    syncMessagesRef,
  ]);

  const stopSessionPreserveState = useCallback((): void => {
    setConnecting(false);
    setTalking("idle");
    dismissInterruption();
  }, [setTalking, dismissInterruption]);

  const switchMode = useCallback(
    (newMode: AppMode): void => {
      if (newMode === modeRef.current) return;
      setShowLanguageSelector(false);
      resetRecommendedQuestions();
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
      syncMessagesRef([]);
    },
    [
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
      syncMessagesRef,
    ],
  );

  const requestInitialBriefing = useCallback(async (): Promise<void> => {
    if (modeRef.current !== "TBM") return;
    if (!preparedSummaryRef.current) return;
    const trigger = chatModeBriefingTrigger(langRef.current);
    await sendTextMessage(trigger, "idle", () => {}, async () => {});
  }, [sendTextMessage]);

  return {
    sessionActive: true,
    connecting,
    micError: null,
    clearMicError: () => {},
    startSession,
    stopSession,
    stopSessionPreserveState,
    switchMode,
    sendTextMessage,
    requestInitialBriefing,
  };
}
