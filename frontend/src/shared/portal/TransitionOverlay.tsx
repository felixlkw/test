// Phase 0.6 Wave 10 — Mode-switch transition overlay.
// Critic P0 #1 (라우팅 race condition) + UIUX P0 #5 (transition feedback) 동시 해소.
// 라우팅 동안 입력 차단 + 시각 신호. ~400ms 노출.

import { Portal } from "./PortalRoot";

interface TransitionOverlayProps {
  open: boolean;
  message: string;
}

export function TransitionOverlay({ open, message }: TransitionOverlayProps): JSX.Element | null {
  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm pointer-events-auto"
        role="status"
        aria-live="polite"
        aria-busy="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-hoban-primary border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-hoban-ink">{message}</p>
        </div>
      </div>
    </Portal>
  );
}
