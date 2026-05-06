// useChecklistProgress — App.tsx L360-365 이전.
import { useMemo } from "react";
import type { ChecklistItem } from "../../services/checklist";

export interface UseChecklistProgressResult {
  completedCount: number;
  progress: number;
  progressPercent: number;
  allItemsCompleted: boolean;
}

export function useChecklistProgress(checklist: ChecklistItem[]): UseChecklistProgressResult {
  return useMemo(() => {
    const completedCount = checklist.filter((item) => item.completed).length;
    const progress = checklist.length > 0 ? completedCount / checklist.length : 0;
    const progressPercent = Math.round(progress * 100);
    // 5-item TBM 체크리스트 모두 완료 — 기존 게이트 유지.
    const allItemsCompleted =
      checklist.length > 0 && completedCount === checklist.length && checklist.length === 5;
    return { completedCount, progress, progressPercent, allItemsCompleted };
  }, [checklist]);
}
