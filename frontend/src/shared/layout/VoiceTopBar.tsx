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
import { TbmModeChip } from "../../features/tbm/useTbmModeChip";
import type { PriorInformation } from "../../features/tbm/types";
import type { StructuredChecklist } from "../../services/sessionModel";
import { TbmProgressDots } from "../../features/tbm/TbmProgressDots";

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
  /** Phase 0.6 Wave 7 — 8필드 dot grid 용 raw 데이터. priorInfo + structured. */
  priorInfo?: PriorInformation;
  structured?: StructuredChecklist;
  /** Phase 0.6 Wave 7 — pause 칩 인라인 액션. VoiceShell 에서 LLM 에게 user msg push. */
  onTbmModeResume?: () => void;
  onTbmModeCancel?: () => void;
  /** Phase 0.6 Wave 9 — TBM 모드 상시 표시 'EHS 채팅으로' 버튼. 터치 fallback. */
  onBackToEhs?: () => void;
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
  // Legacy props — Wave 7에서 8필드 dot grid 로 대체됐지만 외부 호출자 호환을 위해 유지.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priorFilled: _priorFilled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priorTotal: _priorTotal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checklistCompleted: _checklistCompleted,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checklistTotal: _checklistTotal,
  priorInfo,
  structured,
  onTbmModeResume,
  onTbmModeCancel,
  onBackToEhs,
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
      className="w-full flex items-center bg-hoban-bg h-10 sm:h-12 justify-between relative z-20 border-b border-hoban-border px-2 sm:px-4 gap-2 sm:gap-3 shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        onClick={handleHomeClick}
        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-hoban-ink hover:text-hoban-primary active:scale-95 transition shrink-0"
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
      {/* Phase 0.6 Wave 4+7 — conversational TBM mode chip + 인라인 [재개]/[종료]
          액션 칩 (pause 상태일 때만). Self-hides when in ehs_chat. */}
      <TbmModeChip
        language={currentLanguage}
        onResume={onTbmModeResume}
        onCancel={onTbmModeCancel}
      />
      {/* Phase 0.6 Wave 9+10 — TBM 모드 상시 'EHS 채팅으로 돌아가기' 버튼.
          Wave 10: 모바일에서도 노출 (UIUX P0). 모바일은 아이콘만, sm+에서 텍스트도. */}
      {currentMode === "TBM" && onBackToEhs && (
        <button
          type="button"
          onClick={onBackToEhs}
          className="inline-flex shrink-0 items-center gap-1 px-2 py-1 rounded-hoban bg-white border border-hoban-border-strong text-[11px] text-hoban-ink-soft hover:border-hoban-primary hover:text-hoban-primary transition active:scale-95"
          aria-label="EHS 채팅으로 돌아가기 — TBM 종료"
          title="TBM 종료하고 EHS 채팅으로 돌아갑니다"
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">EHS 채팅</span>
        </button>
      )}
      {/* Phase 0.6 Wave 7+10 — 8필드 dot grid. Wave 10: 모바일에서도 노출 (UIUX P0). */}
      {currentMode === "TBM" && priorInfo && structured && (
        <span
          className="inline-flex shrink-0 items-center px-2 py-0.5 rounded-hoban bg-hoban-bg-card border border-hoban-border whitespace-nowrap"
          title="사전정보 4 + 8필드 진행도"
        >
          <TbmProgressDots priorInfo={priorInfo} structured={structured} />
        </span>
      )}
      {transport === "chat" && (
        <span
          className="shrink-0 px-2 py-0.5 rounded-hoban text-[10px] sm:text-xs bg-hoban-bg-card text-hoban-ink-mute border border-hoban-border"
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
