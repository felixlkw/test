// ProgressStack — Cycle 3 chat-log-centric.
// TBM 한정 sticky 진행바. 클릭 시 onTogglePanel 호출 → ChecklistPanel 드로어 오버레이.
// 8-field structured progress는 상단 hairline으로 유지.
// EHS 모드에선 전체 미렌더(VoiceShell이 conditional로 결정).
interface ProgressStackProps {
  currentMode: "TBM" | "EHS";
  structuredProgressPercent: number;
  /** 5-item 진행 바 (TBM only) */
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  showChecklistPanel: boolean;
  onTogglePanel: () => void;
}

export function ProgressStack({
  currentMode,
  structuredProgressPercent,
  completedCount,
  totalCount,
  progressPercent,
  showChecklistPanel,
  onTogglePanel,
}: ProgressStackProps) {
  if (currentMode !== "TBM") return null;
  return (
    <>
      {/* 8-field structured progress hairline (TBM only) */}
      <div className="h-1 bg-pwc-border shrink-0">
        <div
          className="h-full bg-pwc-orange transition-all duration-300"
          style={{ width: `${structuredProgressPercent}%` }}
        />
      </div>

      {/* 5-item TBM progress bar — sticky. 클릭 시 ChecklistPanel 드로어 토글.
          2026-05-06 mobile fix — h-8 sm:h-10 (컴팩트), px-3 sm:px-4, "체크리스트" 라벨 모바일 sr-only(아이콘+카운터로 충분). */}
      <button
        type="button"
        onClick={onTogglePanel}
        aria-expanded={showChecklistPanel}
        aria-label="체크리스트 펼치기"
        className={`w-full flex items-center bg-pwc-bg h-8 sm:h-10 justify-between border-b border-pwc-border px-3 sm:px-4 transition-colors shrink-0 ${
          showChecklistPanel ? "bg-pwc-orange-wash" : "hover:bg-pwc-orange-wash/50"
        }`}
      >
        <span className="text-[11px] uppercase tracking-wider text-pwc-ink-soft font-bold mr-2 sm:mr-3 hidden sm:inline">
          체크리스트
        </span>
        <span className="text-[11px] uppercase tracking-wider text-pwc-ink-soft font-bold mr-2 sm:hidden">
          ✓
        </span>
        <div className="flex-1 flex items-center min-w-0">
          <div className="w-full h-1.5 bg-pwc-border overflow-hidden rounded-full">
            <div
              className="h-full bg-pwc-orange transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <span className="ml-2 sm:ml-4 font-bold text-pwc-orange text-[11px] min-w-[36px] sm:min-w-[40px] text-right tracking-wider whitespace-nowrap">
          {completedCount}/{totalCount}
        </span>
        <svg
          className={`ml-1 sm:ml-2 w-4 h-4 text-pwc-ink-soft transition-transform shrink-0 ${
            showChecklistPanel ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </>
  );
}
