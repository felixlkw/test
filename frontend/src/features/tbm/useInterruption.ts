// useInterruption — App.tsx L342-357 이전.
// PR 4: 10초 → 5초 + 닫기/ESC dismiss + chat-log 영구 기록.
// chat log 기록은 setMessagesRef를 옵션으로 받아 호출 시 [안전 경고] prefix로 영구 추가.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "./types";

export interface UseInterruptionResult {
  showInterruption: boolean;
  interruptionMessage: string;
  /** 토스트 노출 + (옵션) chat log에 영구 기록. */
  showInterruptionMessage: (message: string) => void;
  dismissInterruption: () => void;
}

export interface UseInterruptionOptions {
  /** PR 4: chat log 영구 기록용 setter. 미제공 시 chat log 기록 생략. */
  setMessages?: Dispatch<SetStateAction<ChatMessage[]>>;
}

const TOAST_DURATION_MS = 5000; // PR 4: 10s → 5s

export function useInterruption(
  opts: UseInterruptionOptions = {},
): UseInterruptionResult {
  const { setMessages } = opts;
  const [interruptionMessage, setInterruptionMessage] = useState<string>("");
  const [showInterruption, setShowInterruption] = useState<boolean>(false);
  const interruptionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // setMessages를 ref로 보관해 콜백 재생성을 피함.
  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const showInterruptionMessage = useCallback((message: string) => {
    if (interruptionTimeoutRef.current) {
      clearTimeout(interruptionTimeoutRef.current);
    }
    setInterruptionMessage(message);
    setShowInterruption(true);
    // PR 4: chat log에 영구 기록 ([안전 경고] prefix).
    const setMsg = setMessagesRef.current;
    if (setMsg) {
      setMsg((prev) => [
        ...prev,
        { role: "assistant", text: `[안전 경고] ${message}` },
      ]);
    }
    interruptionTimeoutRef.current = setTimeout(() => {
      setShowInterruption(false);
      setInterruptionMessage("");
    }, TOAST_DURATION_MS);
  }, []);

  const dismissInterruption = useCallback(() => {
    if (interruptionTimeoutRef.current) {
      clearTimeout(interruptionTimeoutRef.current);
      interruptionTimeoutRef.current = null;
    }
    setShowInterruption(false);
    setInterruptionMessage("");
  }, []);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (interruptionTimeoutRef.current) {
        clearTimeout(interruptionTimeoutRef.current);
      }
    };
  }, []);

  return {
    showInterruption,
    interruptionMessage,
    showInterruptionMessage,
    dismissInterruption,
  };
}
