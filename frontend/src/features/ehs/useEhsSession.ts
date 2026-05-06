// useEhsSession — App.tsx L310-326의 recommended-question click handler 이전.
// PR 1: TBM/EHS 통합 voice session(useTbmSession)을 사용. 추후 분리 시점에 별도 인스턴스화 가능.
import { useCallback } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { WebRTCSession } from "../../services/webrtc";
import type { ChatMessage } from "../tbm/types";

export interface UseEhsSessionOptions {
  sessionRef: MutableRefObject<WebRTCSession | null>;
  sessionActive: boolean;
  talking: "idle" | "user" | "assistant";
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setShowRecommendedQuestions: (v: boolean) => void;
  startSession: (
    initialMessage: string | null,
    initialMessageRole: "user" | "assistant" | "system" | null,
  ) => Promise<void>;
}

export function useEhsSession(opts: UseEhsSessionOptions) {
  const {
    sessionRef,
    sessionActive,
    talking,
    setMessages,
    setShowRecommendedQuestions,
    startSession,
  } = opts;

  const handleRecommendedQuestionClick = useCallback(
    async (question: string) => {
      setShowRecommendedQuestions(false);
      if (talking === "assistant" && sessionRef.current) {
        sessionRef.current.interruptResponse();
      }
      if (!sessionActive) {
        // 미활성 세션 — initialMessage로 question을 시작 메시지로 inject.
        // session.start의 dataChannel.onopen이 conversation.item.create + response.create
        // 를 보내므로 별도 sendTextMessage 불필요. setMessages는 startSession 외부에서 1회.
        await startSession(question, "user");
      } else {
        // 2026-05-07 felix HITL — 활성 세션일 때 LLM 전달 누락 회귀.
        // 이전 코드는 setMessages(채팅 푸시)만 하고 sessionRef.sendTextMessage
        // 호출이 없어 OpenAI Realtime은 사용자 발화를 영원히 모름 → AI 응답 무.
        // audioResponse=true로 음성 답변까지 받음(EHS는 voice-first 모드).
        sessionRef.current?.sendTextMessage(
          question,
          "user",
          true /* audioResponse */,
        );
      }
      setMessages((prev) => [...prev, { role: "user", text: question }]);
    },
    [
      setShowRecommendedQuestions,
      talking,
      sessionRef,
      sessionActive,
      startSession,
      setMessages,
    ],
  );

  return { handleRecommendedQuestionClick };
}
