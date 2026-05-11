// VoiceTopBar — Cycle 3 chat-log-centric.
// VoiceStatusChip 유지(작은 인디케이터). ModeSwitcher / LangChip / DomainBadge / 정리본(rightSlot) 그대로.
// 정리본 toggle은 VoiceShell이 rightSlot prop으로 주입.
// Cycle 4 (issue #2, felix HITL): 좌측 끝에 홈 버튼. 세션 active 시 stopSessionPreserveState 후 navigate("/").
//   IndexedDB 자동저장은 useSessionPersistence가 처리(300ms debounce, invariants #1/#2/#3 유지).
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import type { SessionLanguage } from "../../services/sessionModel";
import type { AppMode } from "../../features/tbm/types";
import { VoiceStatusChip } from "../ui/VoiceStatusChip";
import { ModeSwitcher } from "../ui/ModeSwitcher";
import { LangChip } from "../ui/LangChip";
import { LangDropdown } from "../portal/LangDropdown";
import { Portal } from "../portal/PortalRoot";
import { IconHome } from "../../components/Icon";
import { getChatModeChip } from "../i18n/cueMessages";

interface VoiceTopBarProps {
  sessionActive: boolean;
  connecting: boolean;
  talking: "idle" | "user" | "assistant";
  currentMode: AppMode;
  currentLanguage: SessionLanguage;
  showLanguageSelector: boolean;
  setShowLanguageSelector: Dispatch<SetStateAction<boolean>>;
  onClickStart: () => void;
  onClickStop: () => void;
  onSwitchMode: (mode: AppMode) => void;
  onSelectLanguage: (lang: SessionLanguage) => void;
  /** Cycle 3: 정리본 버튼 등 우측 액션 슬롯. */
  rightSlot?: ReactNode;
  /**
   * Cycle 4: 홈 버튼 클릭 시 진행 중 세션 정지(상태 보존). 미제공 시 단순 navigate.
   * VoiceShell이 session.stopSessionPreserveState를 주입.
   */
  onLeaveToHome?: () => void;
  /** Phase chat-PR3: 현재 트랜스포트. "chat" 일 때 우측에 작은 chip 표시. */
  transport?: "voice" | "chat";
  /** PR-feedback-3 — 컴팩트 인디케이터 "사전 N/4 · 체크 M/T". TBM 모드 + 값 주입 시만. */
  priorFilled?: number;
  priorTotal?: number;
  checklistCompleted?: number;
  checklistTotal?: number;
}

export function VoiceTopBar({
  sessionActive,
  connecting,
  talking,
  currentMode,
  currentLanguage,
  showLanguageSelector,
  setShowLanguageSelector,
  onClickStart,
  onClickStop,
  onSwitchMode,
  onSelectLanguage,
  rightSlot,
  onLeaveToHome,
  transport = "voice",
  priorFilled,
  priorTotal,
  checklistCompleted,
  checklistTotal,
}: VoiceTopBarProps) {
  const langChipRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const handleHomeClick = () => {
    // 세션 진행 중이면 짧은 confirm 후 정지(상태 보존) + 홈으로 이동.
    // IndexedDB는 useSessionPersistence(debounced 300ms)가 자동 저장 → 다시 들어오면 hydrate.
    if (sessionActive || connecting) {
      const ok = window.confirm(
        "진행 중인 세션을 잠시 멈추고 홈으로 이동합니다. 계속할까요?",
      );
      if (!ok) return;
      onLeaveToHome?.();
    }
    navigate("/");
  };

  return (
    <div
      // 2026-05-06 mobile fix — h-10 sm:h-12 (모바일 컴팩트). px-2 sm:px-4 (좌우 여백 축소).
      // 칩들 사이 mr-* 대신 gap-2 sm:gap-3 wrapper로 통일 — 좁은 폭에서 일관된 간격.
      className="w-full flex items-center bg-pwc-bg h-10 sm:h-12 justify-between relative z-20 border-b border-pwc-border px-2 sm:px-4 gap-2 sm:gap-3 shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        onClick={handleHomeClick}
        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-pwc-ink hover:text-pwc-orange active:scale-95 transition shrink-0"
        aria-label="홈으로"
      >
        <IconHome size={20} />
      </button>
      <div className="shrink-0">
        <VoiceStatusChip
          sessionActive={sessionActive}
          connecting={connecting}
          talking={talking}
          onClickStart={onClickStart}
          onClickStop={onClickStop}
        />
      </div>
      <div className="shrink-0">
        <ModeSwitcher
          currentMode={currentMode}
          onSwitch={onSwitchMode}
          disabled={connecting}
        />
      </div>
      <div
        ref={langChipRef}
        data-lang-chip
        className="relative shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <LangChip
          currentLanguage={currentLanguage}
          onClick={() => setShowLanguageSelector(!showLanguageSelector)}
        />
      </div>
      <div className="flex-1 min-w-0"></div>
      {/* PR-feedback-3 — TBM 모드 + slot/체크 카운트 주입 시 컴팩트 인디케이터.
          모바일에서는 좁아 숨김(sm 이상에서 노출). 본 칩은 read-only. */}
      {currentMode === "TBM" &&
        priorTotal !== undefined &&
        checklistTotal !== undefined && (
          <span
            className="hidden sm:inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-pwc text-[10px] sm:text-[11px] bg-pwc-bg-card text-pwc-ink-soft border border-pwc-border whitespace-nowrap"
            title="사전정보 슬롯 · 체크리스트 진행"
            aria-label={`사전정보 ${priorFilled ?? 0} / ${priorTotal} 채움, 체크리스트 ${checklistCompleted ?? 0} / ${checklistTotal} 완료`}
          >
            <span className="text-pwc-ink-mute">사전</span>
            <span className="font-semibold text-pwc-ink">
              {priorFilled ?? 0}/{priorTotal}
            </span>
            <span aria-hidden="true" className="text-pwc-border-strong">·</span>
            <span className="text-pwc-ink-mute">체크</span>
            <span className="font-semibold text-pwc-ink">
              {checklistCompleted ?? 0}/{checklistTotal}
            </span>
          </span>
        )}
      {transport === "chat" && (
        <span
          className="shrink-0 px-2 py-0.5 rounded-pwc text-[10px] sm:text-xs bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border"
          title={getChatModeChip(currentLanguage)}
        >
          {getChatModeChip(currentLanguage)}
        </span>
      )}
      {rightSlot && <div className="flex items-center shrink-0">{rightSlot}</div>}

      <Portal>
        <LangDropdown
          open={showLanguageSelector}
          currentLanguage={currentLanguage}
          onSelect={onSelectLanguage}
          onClose={() => setShowLanguageSelector(false)}
          anchorRect={langChipRef.current?.getBoundingClientRect() ?? null}
        />
      </Portal>
    </div>
  );
}
