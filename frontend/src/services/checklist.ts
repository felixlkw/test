// Checklist items and types shared with backend

export interface ChecklistItem {
  index: number; // 1-based index
  content: string;
  completed?: boolean;
  utterance?: string;
  checkedAt?: string; // Timestamp when checked
}

// Create checklist items from an array of strings
export function createChecklistItems(items: string[]): ChecklistItem[] {
  return items.map((content, i) => ({
    index: i + 1,
    content,
    completed: false,
  }));
}

// Default empty checklist for initialization
export const DEFAULT_CHECKLIST: ChecklistItem[] = [];

// Legacy checklist for reference (not used in dynamic mode)
export const LEGACY_CHECKLIST_ITEMS: ChecklistItem[] = [
  { index: 1, content: '안전벨트 착용' },
  { index: 2, content: '랜야드 고정 위치' },
  { index: 3, content: '발판·작업대 흔들림' },
  { index: 4, content: '작업 위치 난간·가림막' },
  { index: 5, content: '강풍 시 작업 중지 기준' },
  { index: 6, content: '비 올 때 미끄럼·중지 기준' },
  { index: 7, content: '이동 경로 사전 확인' },
  { index: 8, content: '낙하물 주의 안내' },
  { index: 9, content: '안전모 턱끈 착용' },
  { index: 10, content: '작업 위치 변경 여부' },
]; 