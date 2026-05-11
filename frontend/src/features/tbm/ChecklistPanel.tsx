// ChecklistPanel — App.tsx L1421-1572 이전.
// toggleChecklistItem 로직(L876-918)도 자체 보유.
//
// PR-feedback-3 (v0.2.3) 변경:
//   - PriorRow에 슬라이드 인 + 0.5s 오렌지 펄스 애니메이션 (filled 상태 전환 직후).
//   - skip 항목 (`item.skipped === true`): 흐릿한 표시 + "건너뜀" 칩.
//   - 옵셔널 prop `missingOnly?: boolean` — true면 미완(완료 X + skip X)만 필터.
//     ClosingBanner의 "자세히 보기" 클릭 시 본 모드로 패널 open.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { IconClose, IconShield, IconLock } from "../../components/Icon";
import type { WebRTCSession } from "../../services/webrtc";
import type { ChecklistItem } from "../../services/checklist";
import type { PriorInformation } from "./types";

interface ChecklistPanelProps {
  show: boolean;
  onClose: () => void;
  checklist: ChecklistItem[];
  setChecklist: React.Dispatch<React.SetStateAction<ChecklistItem[]>>;
  priorInfo: PriorInformation;
  completedCount: number;
  sessionRef: MutableRefObject<WebRTCSession | null>;
  /** PR-feedback-3 — true면 미완(completed=false && skipped=false)만 표시. */
  missingOnly?: boolean;
}

export function ChecklistPanel({
  show,
  onClose,
  checklist,
  setChecklist,
  priorInfo,
  completedCount,
  sessionRef,
  missingOnly = false,
}: ChecklistPanelProps) {
  if (!show) return null;

  const toggleChecklistItem = (index: number) => {
    setChecklist((prev) => {
      const updatedChecklist = prev.map((item) =>
        item.index === index
          ? {
              ...item,
              completed: !item.completed,
              utterance: item.completed ? "" : "수동으로 체크됨",
              checkedAt: !item.completed ? new Date().toISOString() : undefined,
            }
          : item,
      );

      const toggledItem = updatedChecklist.find((item) => item.index === index);
      if (toggledItem && sessionRef.current) {
        const action = toggledItem.completed ? "checked" : "unchecked";
        const completedItems = updatedChecklist.filter((it) => it.completed);
        const incompleteItems = updatedChecklist.filter((it) => !it.completed);

        let message = `User manually ${action} checklist item: "${toggledItem.content}"\n\n`;
        message += `Current checklist status:\n`;
        message += `Completed items (${completedItems.length}/${updatedChecklist.length}):\n`;
        completedItems.forEach((it) => {
          message += `✅ ${it.index}. ${it.content}\n`;
        });
        if (incompleteItems.length > 0) {
          message += `\nIncomplete items (${incompleteItems.length}/${updatedChecklist.length}):\n`;
          incompleteItems.forEach((it) => {
            message += `⬜ ${it.index}. ${it.content}\n`;
          });
        }
        console.log("system message", message);
        sessionRef.current.sendTextMessage(message, "user", true);
      }

      return updatedChecklist;
    });
  };

  // Cycle 3: chat 위에 드로어 오버레이. Portal 사용. 백드롭 클릭 시 닫힘.
  return (
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      style={{ zIndex: 30 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-pwc-bg border border-pwc-border rounded-b-pwc-lg shadow-pwc-card overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh", marginTop: "0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-pwc-border bg-pwc-bg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconShield size={20} gradient />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                TBM
              </div>
              <div className="font-serif-display text-[18px] leading-tight">작업 현황</div>
            </div>
          </div>
          <button
            className="text-pwc-ink-soft hover:text-pwc-orange transition-colors p-2"
            onClick={onClose}
            aria-label="Close checklist panel"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollBehavior: "smooth" }}>
          {/* Prior Information Section */}
          <div className="px-6 py-4 border-b border-pwc-border">
            <div className="flex items-center gap-2 mb-3">
              <svg
                className="w-5 h-5 text-pwc-orange"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="font-semibold text-pwc-orange text-lg">사전 정보</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <PriorRow label="작업장소" value={priorInfo.workLocation} />
              <PriorRow label="작업내용" value={priorInfo.workContentDetails} />
              <PriorRow
                label="작업자수"
                value={priorInfo.numberOfWorkers ? `${priorInfo.numberOfWorkers}명` : undefined}
              />
              <PriorRow label="장비정보" value={priorInfo.equipmentDetails} />
            </div>
          </div>

          {/* Safety Checklist Section */}
          {(() => {
            // PR-feedback-3 — missingOnly 모드: 미완 + skip 안 한 항목만.
            const visibleItems = missingOnly
              ? checklist.filter((it) => !it.completed && !it.skipped)
              : checklist;
            const skippedCount = checklist.filter((it) => it.skipped).length;
            return (
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-pwc-orange"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <h3 className="font-semibold text-pwc-orange text-lg">
                안전 체크리스트
                {missingOnly && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-pwc-orange-deep bg-pwc-orange/15 px-1.5 py-0.5 rounded-full border border-pwc-orange/30 font-bold align-middle">
                    미기입만
                  </span>
                )}
              </h3>
              <div className="ml-auto bg-pwc-orange/20 px-3 py-1 rounded-full border border-pwc-orange/30">
                <span className="text-xs font-semibold text-pwc-ink">
                  {completedCount}/{checklist.length} 완료
                  {skippedCount > 0 && (
                    <span className="ml-1 text-pwc-ink-mute font-normal">
                      · 건너뜀 {skippedCount}
                    </span>
                  )}
                </span>
              </div>
            </div>
            {missingOnly && visibleItems.length === 0 && (
              <p className="text-xs text-pwc-ink-mute italic py-3">
                미기입 항목이 없습니다.
              </p>
            )}
            <ul className="space-y-3">
              {visibleItems.map((item) => (
                <li
                  key={item.index}
                  className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                    item.skipped
                      ? "bg-pwc-bg-card/60 border-pwc-border opacity-60 hover:opacity-80"
                      : item.completed
                        ? "bg-pwc-orange/10 border-pwc-orange/30 shadow-lg shadow-pwc-orange/5 hover:bg-pwc-orange/15"
                        : "bg-pwc-bg-card border-pwc-border hover:border-pwc-orange/50 hover:bg-pwc-orange-wash"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleChecklistItem(item.index);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`mt-0.5 w-7 h-7 flex items-center justify-center rounded-full border-2 transition-all ${
                        item.skipped
                          ? "bg-pwc-bg-card border-pwc-border-strong text-pwc-ink-mute"
                          : item.completed
                            ? "bg-pwc-orange border-pwc-orange text-white"
                            : "bg-transparent border-pwc-border text-pwc-ink-mute hover:border-pwc-orange/50 hover:bg-pwc-orange/10"
                      }`}
                    >
                      {item.skipped ? (
                        <span className="text-[10px] font-bold" aria-hidden="true">
                          —
                        </span>
                      ) : item.completed ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{item.index}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span
                          className={`font-medium block ${
                            item.skipped
                              ? "text-pwc-ink-mute italic"
                              : item.completed
                                ? "text-pwc-ink"
                                : "text-pwc-ink-soft"
                          }`}
                        >
                          {item.content}
                        </span>
                        {item.skipped && (
                          <span
                            className="inline-flex items-center gap-1 shrink-0 mt-[2px] px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border-strong"
                            title="사용자가 명시적으로 건너뛴 항목 — 리포트에 표기됨"
                            aria-label="건너뜀"
                          >
                            건너뜀
                          </span>
                        )}
                        {item.is_baseline && (
                          <span
                            className="inline-flex items-center gap-1 shrink-0 mt-[2px] px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-pwc-orange/15 text-pwc-orange-deep border border-pwc-orange/30"
                            title="준비 단계에서 자동 포함된 필수 점검 항목"
                            aria-label="필수 항목"
                          >
                            <IconLock size={10} />
                            <span>필수</span>
                          </span>
                        )}
                      </div>
                      {item.is_baseline && item.regulation && (
                        <div className="text-[11px] text-pwc-ink-mute mt-1">
                          {item.regulation}
                        </div>
                      )}
                      {item.completed && item.utterance && (
                        <div className="mt-2 p-2 bg-pwc-bg-card rounded border-l-2 border-pwc-orange">
                          <div className="text-[10px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
                            응답
                          </div>
                          <div className="text-sm text-pwc-ink">"{item.utterance}"</div>
                        </div>
                      )}
                      {item.completed && item.checkedAt && (
                        <div className="text-xs text-pwc-ink-mute mt-2 flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {new Date(item.checkedAt).toLocaleString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function PriorRow({ label, value }: { label: string; value?: string }) {
  const filled = !!value;
  // PR-feedback-3 — slot이 unfilled → filled로 전환된 직후 1회 펄스 + 슬라이드 인.
  // useRef로 이전 filled 상태 추적 → 전환 시점에만 animation key를 update.
  const prevFilledRef = useRef<boolean>(filled);
  const [pulseKey, setPulseKey] = useState<number>(0);
  useEffect(() => {
    if (!prevFilledRef.current && filled) {
      setPulseKey((k) => k + 1);
    }
    prevFilledRef.current = filled;
  }, [filled]);
  return (
    <div
      key={pulseKey > 0 ? `filled-${pulseKey}` : "unfilled"}
      className={`p-3 rounded-xl border transition-colors ${
        pulseKey > 0 && filled ? "animate-slot-pulse animate-slot-slide-in " : ""
      }${
        filled ? "bg-pwc-orange/10 border-pwc-orange/30" : "bg-pwc-bg-card border-pwc-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-pwc-ink-soft">{label}</span>
        <span
          className={`w-2 h-2 rounded-full ${
            filled ? "bg-pwc-orange" : "bg-pwc-border-strong"
          }`}
        ></span>
      </div>
      <div className={`mt-1 text-sm ${filled ? "text-pwc-ink" : "text-pwc-ink-mute"}`}>
        {value ?? "미입력"}
      </div>
    </div>
  );
}
