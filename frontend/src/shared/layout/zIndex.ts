// 4-단계 z-index 표준. PR 1.
// plan.md §9 그대로.
export const Z = {
  background: 0,
  shellContent: 10,
  panelOverlay: 20,
  systemInterrupt: 30,
} as const;

export type ZLayer = (typeof Z)[keyof typeof Z];
