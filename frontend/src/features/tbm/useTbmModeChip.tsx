// Phase 0.6 Wave 4+7 — persistent TBM mode chip + state tracker.
//
// Listens to the same tool-call stream as useWebRTCEvents (via a small
// pub-sub) and exposes the current conversational mode for the top bar.
// Distinct from the transient "interruption message" toast — this chip
// stays until cleared.
//
// Wave 7 — i18n via getTbmTransitionStrings + inline [Resume]/[End] action
// chips when in tbm_paused state.

import { useEffect, useState } from "react";
import type { SessionLanguage } from "../../services/sessionModel";
import { getTbmTransitionStrings } from "../../shared/i18n/tbmTransitionMessages";

export type ConversationalTbmMode =
  | "ehs_chat"      // open EHS chat (default)
  | "tbm_entering"  // enter_tbm_mode received, awaiting prior_info collection
  | "tbm_running"   // active TBM
  | "tbm_paused"    // pause_tbm received, awaiting resume or cancel
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

const TONE_CLASS: Record<"default" | "primary" | "warning" | "success", string> = {
  default: "bg-hoban-bg-card text-hoban-ink-soft border-hoban-border",
  primary: "bg-hoban-primary-soft text-hoban-primary-deep border-hoban-primary/30",
  warning: "bg-hoban-accent-soft text-hoban-accent-deep border-hoban-accent/30",
  success: "bg-hoban-accent-soft text-hoban-accent-deep border-hoban-accent/30",
};

const MODE_TONE: Record<ConversationalTbmMode, "default" | "primary" | "warning" | "success"> = {
  ehs_chat: "default",
  tbm_entering: "primary",
  tbm_running: "primary",
  tbm_paused: "warning",
  tbm_finished: "success",
};

// Wave 10 — entering 과 running 시각 차별화 (Critic P2). entering 은 약간 반투명
// 처리해서 "준비 중" 임을 직관 노출. running 은 풀톤.
const MODE_OPACITY: Record<ConversationalTbmMode, string> = {
  ehs_chat: "",
  tbm_entering: "opacity-75",
  tbm_running: "",
  tbm_paused: "",
  tbm_finished: "",
};

interface TbmModeChipProps {
  language?: SessionLanguage;
  /** Wave 7 — pause 상태일 때 인라인 액션 칩의 콜백. 미주입 시 액션 숨김. */
  onResume?: () => void;
  onCancel?: () => void;
}

export function TbmModeChip({
  language = "korean",
  onResume,
  onCancel,
}: TbmModeChipProps): JSX.Element | null {
  const state = useTbmMode();
  if (state.mode === "ehs_chat") return null; // hide in default chat
  const strings = getTbmTransitionStrings(language);
  const label = strings.modeChip[state.mode];
  const tone = MODE_TONE[state.mode];
  const cls = TONE_CLASS[tone];
  const isPaused = state.mode === "tbm_paused";
  const dim = MODE_OPACITY[state.mode];
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-hoban border text-[11px] font-semibold ${cls} ${dim}`}
        role="status"
        aria-live="polite"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full bg-current opacity-80 ${
            isPaused ? "" : "animate-pulse"
          }`}
          aria-hidden="true"
        />
        {label}
        {/* Wave 10 — workTitle truncate 폭 확대 (UIUX P1). 모바일 80px, sm+ 200px. */}
        {state.workTitle && !isPaused && (
          <span
            className="opacity-70 font-normal max-w-[80px] sm:max-w-[200px] truncate"
            title={state.workTitle}
          >
            · {state.workTitle}
          </span>
        )}
      </div>
      {/* Wave 7 — pause 상태에서 인라인 [재개]/[종료] 액션 칩 (터치 56dp 보장). */}
      {isPaused && (onResume || onCancel) && (
        <div className="inline-flex items-center gap-1">
          {onResume && (
            <button
              type="button"
              onClick={onResume}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-hoban bg-hoban-primary text-white hover:bg-hoban-primary-deep transition active:scale-95"
              aria-label={strings.action.resume}
            >
              ▶ {strings.action.resume}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-hoban bg-white border border-hoban-border-strong text-hoban-ink-soft hover:border-hoban-accent-deep hover:text-hoban-accent-deep transition active:scale-95"
              aria-label={strings.action.cancel}
            >
              ✕ {strings.action.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
