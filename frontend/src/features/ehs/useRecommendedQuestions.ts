// EHS 추천 질문 회전 훅. PR 1: App.tsx L258-307 그대로 이전.
// PR 2에서 paused prop 추가 예정 — 시그니처는 미리 받되, 동작 변경 0(default false 유지).
// PR D Q5 (OLD-M11): hover/focus pause + 수동 "다음 질문" 회전.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppMode } from "../tbm/types";
import { RECOMMENDED_QUESTIONS } from "./recommendedQuestions";

export interface UseRecommendedQuestionsResult {
  showRecommendedQuestions: boolean;
  setShowRecommendedQuestions: (v: boolean) => void;
  displayedQuestions: string[];
  remainingQuestions: string[];
  animatingOut: boolean;
  /** PR D Q5: 사용자가 "다른 질문" 버튼을 눌러 수동 회전. 즉시 displayed[0] 제거 + remaining에서 신규 chip 1건 가져옴. */
  rotateNow: () => void;
}

export function useRecommendedQuestions(
  currentMode: AppMode,
  paused: boolean = false,
): UseRecommendedQuestionsResult {
  const [showRecommendedQuestions, setShowRecommendedQuestions] = useState(false);
  const [displayedQuestions, setDisplayedQuestions] = useState<string[]>([]);
  const [remainingQuestions, setRemainingQuestions] = useState<string[]>([]);
  const [animatingOut, setAnimatingOut] = useState(false);
  const questionRotationRef = useRef<NodeJS.Timeout | null>(null);

  // 모드 전환 시 초기화 (App.tsx L258-270)
  useEffect(() => {
    if (currentMode === "EHS") {
      const shuffled = [...RECOMMENDED_QUESTIONS].sort(() => Math.random() - 0.5);
      setDisplayedQuestions(shuffled.slice(0, 4));
      setRemainingQuestions(shuffled.slice(4));
      setShowRecommendedQuestions(true);
    } else {
      setShowRecommendedQuestions(false);
      setDisplayedQuestions([]);
      setRemainingQuestions([]);
    }
  }, [currentMode]);

  // 회전 (App.tsx L273-307). paused면 interval 미생성.
  useEffect(() => {
    if (
      !paused &&
      currentMode === "EHS" &&
      showRecommendedQuestions &&
      remainingQuestions.length > 0
    ) {
      questionRotationRef.current = setInterval(() => {
        setAnimatingOut(true);
        setTimeout(() => {
          setDisplayedQuestions((prev) => {
            const newDisplayed = [...prev];
            newDisplayed.shift();
            return newDisplayed;
          });
          setRemainingQuestions((prev) => {
            if (prev.length === 0) return prev;
            const randomIndex = Math.floor(Math.random() * prev.length);
            const selectedQuestion = prev[randomIndex];
            const newRemaining = prev.filter((_, idx) => idx !== randomIndex);
            setDisplayedQuestions((current) => [...current, selectedQuestion]);
            return newRemaining;
          });
          setAnimatingOut(false);
        }, 300);
      }, 5000);
    }
    return () => {
      if (questionRotationRef.current) {
        clearInterval(questionRotationRef.current);
        questionRotationRef.current = null;
      }
    };
  }, [currentMode, showRecommendedQuestions, remainingQuestions.length, paused]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (questionRotationRef.current) {
        clearInterval(questionRotationRef.current);
      }
    };
  }, []);

  // PR D Q5: 수동 회전 — 즉시 displayed[0] 제거 + remaining에서 random chip 1건 가져옴.
  // animatingOut에 의존하지 않고 즉시 swap (사용자 의도 반영). pause 상태와 무관.
  const rotateNow = useCallback(() => {
    if (currentMode !== "EHS" || displayedQuestions.length === 0) return;
    setRemainingQuestions((prev) => {
      if (prev.length === 0) return prev;
      const randomIndex = Math.floor(Math.random() * prev.length);
      const selected = prev[randomIndex];
      const newRemaining = prev.filter((_, idx) => idx !== randomIndex);
      setDisplayedQuestions((current) => {
        const next = [...current];
        next.shift();
        next.push(selected);
        return next;
      });
      return newRemaining;
    });
  }, [currentMode, displayedQuestions.length]);

  return {
    showRecommendedQuestions,
    setShowRecommendedQuestions,
    displayedQuestions,
    remainingQuestions,
    animatingOut,
    rotateNow,
  };
}
