// SummaryDrawer — App.tsx L1037-1115 이전. Portal로 이동.
// Cycle 2 이슈 4: checklist_items[] 섹션 추가 (체크리스트 진행).
// 2026-05-23 — drawer가 단일 정보 hub. 헤더에 "📢 전파 완료(서명)" 진입 버튼 추가
// — 기존 BroadcastCompleteCTA → AttestationModal 직결 흐름을 drawer 내부로 이전.
import SummaryRow from "../../components/SummaryRow";
import { IconClose, IconLock } from "../../components/Icon";
import type { StructuredChecklist } from "../../services/sessionModel";
import type { ChecklistItem } from "../../services/checklist";

interface SummaryDrawerProps {
  open: boolean;
  onClose: () => void;
  structured: StructuredChecklist;
  finalSummary: string;
  structuredProgressPercent: number;
  hazardSuggestions: { hazard: string; rationale: string }[];
  onClearHazardSuggestions: () => void;
  /** Cycle 2 이슈 4: 체크리스트 섹션. 빈 배열이면 자리표시자 노출. */
  checklist: ChecklistItem[];
  /** PR A 보강: PrepareScreen에서 확정한 baseline 위험. 빈 배열이면 섹션 미렌더. */
  preparedHazards?: string[];
  /** 2026-05-23 — broadcast 진입 핸들러. 미주입이면 버튼 미렌더(EHS / legacy). */
  onBroadcast?: () => void;
  /** broadcast 활성화 가능 여부 (체크리스트·structured·참석 조건 충족). */
  broadcastReady?: boolean;
  /** broadcast 미준비 시 hover/title 메시지 — 미충족 항목 한 줄 요약. */
  broadcastMissingLabel?: string;
}

function formatCheckedAt(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

export function SummaryDrawer({
  open,
  onClose,
  structured,
  finalSummary,
  structuredProgressPercent,
  hazardSuggestions,
  onClearHazardSuggestions,
  checklist,
  preparedHazards,
  onBroadcast,
  broadcastReady,
  broadcastMissingLabel,
}: SummaryDrawerProps) {
  if (!open) return null;
  const completedCount = checklist.filter((c) => c.completed).length;
  const baselineList = preparedHazards ?? [];
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-end"
      style={{ zIndex: 30 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-hoban-bg text-hoban-ink border-l border-hoban-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-hoban-bg border-b border-hoban-border px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold">
              지금까지 정리본
            </div>
            <div className="font-serif-display text-[22px] leading-tight mt-0.5">
              {structuredProgressPercent}% 진행
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onBroadcast && (
              <button
                type="button"
                onClick={onBroadcast}
                disabled={!broadcastReady}
                aria-disabled={broadcastReady ? undefined : "true"}
                title={
                  broadcastReady
                    ? "작업자에게 baseline 위험을 전파했음을 1탭으로 기록 + 리더 서명"
                    : `전파 완료 활성화 조건: ${broadcastMissingLabel ?? "준비 중"}`
                }
                className={
                  broadcastReady
                    ? "flex items-center gap-1 bg-hoban-primary hover:bg-hoban-primary-deep text-white font-bold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-hoban transition whitespace-nowrap"
                    : "flex items-center gap-1 bg-hoban-bg-soft text-hoban-ink-soft font-bold text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-hoban border border-hoban-border-strong cursor-not-allowed whitespace-nowrap"
                }
              >
                <span aria-hidden="true">📢</span>
                <span>전파 완료</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-hoban-ink-soft hover:text-hoban-primary"
              aria-label="close"
            >
              <IconClose size={20} />
            </button>
          </div>
        </div>

        <div className="p-5">
          {finalSummary && (
            <section className="mb-5 border-l-4 border-hoban-primary bg-hoban-primary-wash p-4">
              <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold mb-2">
                최종 요약 · AI 생성
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-hoban-ink">
                {finalSummary}
              </div>
            </section>
          )}

          {/* PR A 보강: 준비 단계 baseline 섹션. 빈 배열이면 섹션 자체 미렌더. */}
          {baselineList.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold">
                  준비 단계 필수 점검 ({baselineList.length}건)
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {baselineList.map((content, i) => (
                  <li
                    key={`baseline-${i}`}
                    className="flex items-start gap-2 text-sm rounded-hoban px-3 py-2 border border-hoban-primary/30 bg-hoban-primary-wash"
                  >
                    <span
                      aria-hidden
                      className="mt-[2px] inline-flex w-4 h-4 shrink-0 items-center justify-center text-hoban-primary-deep"
                      title="준비 단계 필수 항목"
                    >
                      <IconLock size={12} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="leading-snug text-hoban-ink">{content}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Cycle 2 이슈 4: 체크리스트 진행 섹션 */}
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold">
                체크리스트 진행
              </div>
              {checklist.length > 0 && (
                <div className="text-[11px] text-hoban-ink-soft">
                  {completedCount}/{checklist.length}
                </div>
              )}
            </div>
            {checklist.length === 0 ? (
              <div className="text-xs text-hoban-ink-soft bg-hoban-bg-card border border-hoban-border rounded-hoban px-3 py-3">
                체크리스트가 아직 생성되지 않았습니다
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {checklist.map((item) => {
                  const checked = !!item.completed;
                  const time = formatCheckedAt(item.checkedAt);
                  return (
                    <li
                      key={item.index}
                      className={`flex items-start gap-2 text-sm rounded-hoban px-3 py-2 border ${
                        checked
                          ? "border-hoban-primary/40 bg-hoban-primary-wash"
                          : "border-hoban-border bg-hoban-bg-card"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-[2px] inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          checked
                            ? "bg-hoban-primary text-white"
                            : "bg-white text-hoban-ink-soft border border-hoban-border-strong"
                        }`}
                      >
                        {checked ? "✓" : "○"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`leading-snug ${
                            checked ? "text-hoban-ink" : "text-hoban-ink-soft"
                          }`}
                        >
                          {item.content}
                        </div>
                        {checked && item.utterance && (
                          <div
                            className="mt-1 text-[11px] text-hoban-ink-soft truncate"
                            title={item.utterance}
                          >
                            “{item.utterance}”
                          </div>
                        )}
                        {checked && time && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-hoban-ink-soft">
                            {time}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex flex-col">
            <SummaryRow label="오늘 작업 내용" value={structured.work_summary} />
            <SummaryRow label="평소와 달라진 점" value={structured.changes_today} />
            <SummaryRow label="주요 위험요인" value={structured.hazards} />
            <SummaryRow label="위험 시나리오" value={structured.risk_scenarios} />
            <SummaryRow label="대응/예방 조치" value={structured.mitigations} />
            <SummaryRow label="보호구/장비 확인" value={structured.ppe} />
            <SummaryRow label="특이사항" value={structured.special_notes} />
            <SummaryRow
              label="참석 확인"
              value={structured.attendance_confirmed ? "확인됨" : undefined}
            />
          </div>

          {hazardSuggestions.length > 0 && (
            <section className="mt-6 border-l-4 border-hoban-primary bg-hoban-primary-wash p-4">
              <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold mb-2">
                AI 추가 확인 제안
              </div>
              <ul className="flex flex-col gap-3">
                {hazardSuggestions.map((s, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-semibold text-hoban-ink">• {s.hazard}</div>
                    <div className="text-hoban-ink-soft text-xs mt-0.5">{s.rationale}</div>
                  </li>
                ))}
              </ul>
              <button
                onClick={onClearHazardSuggestions}
                className="mt-3 w-full text-xs py-2 rounded-hoban bg-white text-hoban-ink-soft border border-hoban-border hover:text-hoban-primary hover:border-hoban-primary transition"
              >
                제안 닫기
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
