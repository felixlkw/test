// Phase 0.6 Wave 4 — persistent TBM mode chip + state tracker.
//
// Listens to the same tool-call stream as useWebRTCEvents (via a small
// pub-sub) and exposes the current conversational mode for the top bar.
// Distinct from the transient "interruption message" toast — this chip
// stays until cleared.

import { useEffect, useState } from "react";

export type ConversationalTbmMode =
  | "ehs_chat"      // open EHS chat (default)
  | "tbm_entering"  // enter_tbm_mode received, awaiting prior_info collection
  | "tbm_running"   // active TBM
  | "tbm_paused"   // pause_tbm received, awaiting resume or cancel
  | "tbm_finished"; // finalize_tbm complete

export interface TbmModeState {
  mode: ConversationalTbmMode;
  workTitle?: string;
  checkpointNote?: string;
  pauseReason?: string;
}

type Listener = (state: TbmModeState) => void;
const listeners = new Set<Listener>();
let current: TbmModeState = { mode: "ehs_chat" };

export function setTbmMode(next: Partial<TbmModeState>): void {
  current = { ...current, ...next };
  for (const l of listeners) l(current);
}

export function getTbmMode(): TbmModeState {
  return current;
}

export function useTbmMode(): TbmModeState {
  const [state, setState] = useState<TbmModeState>(current);
  useEffect(() => {
    const fn: Listener = (s) => setState(s);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return state;
}

const MODE_LABEL: Record<ConversationalTbmMode, { label: string; tone: "default" | "primary" | "warning" | "success" }> = {
  ehs_chat: { label: "EHS 채팅", tone: "default" },
  tbm_entering: { label: "TBM 준비", tone: "primary" },
  tbm_running: { label: "TBM 진행 중", tone: "primary" },
  tbm_paused: { label: "TBM 일시중지", tone: "warning" },
  tbm_finished: { label: "TBM 완료", tone: "success" },
};

const TONE_CLASS: Record<"default" | "primary" | "warning" | "success", string> = {
  default: "bg-hoban-bg-card text-hoban-ink-soft border-hoban-border",
  primary: "bg-hoban-primary-soft text-hoban-primary-deep border-hoban-primary/30",
  warning: "bg-hoban-accent-soft text-hoban-accent-deep border-hoban-accent/30",
  success: "bg-hoban-accent-soft text-hoban-accent-deep border-hoban-accent/30",
};

export function TbmModeChip(): JSX.Element | null {
  const state = useTbmMode();
  if (state.mode === "ehs_chat") return null; // hide in default chat
  const cfg = MODE_LABEL[state.mode];
  const cls = TONE_CLASS[cfg.tone];
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-hoban border text-[11px] font-semibold ${cls}`}
      role="status"
      aria-live="polite"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {cfg.label}
      {state.workTitle && state.mode !== "tbm_paused" && (
        <span className="opacity-70 font-normal max-w-[120px] truncate" title={state.workTitle}>
          · {state.workTitle}
        </span>
      )}
    </div>
  );
}
