// SummaryDrawer — App.tsx L1037-1115 이전. Portal로 이동.
// Cycle 2 이슈 4: checklist_items[] 섹션 추가 (체크리스트 진행).
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
        className="w-full max-w-md h-full bg-pwc-bg text-pwc-ink border-l border-pwc-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-pwc-bg border-b border-pwc-border px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
              지금까지 정리본
            </div>
            <div className="font-serif-display text-[22px] leading-tight mt-0.5">
              {structuredProgressPercent}% 진행
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-pwc-ink-soft hover:text-pwc-orange"
            aria-label="close"
          >
            <IconClose size={20} />
          </button>
        </div>

        <div className="p-5">
          {finalSummary && (
            <section className="mb-5 border-l-4 border-pwc-orange bg-pwc-orange-wash p-4">
              <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-2">
                최종 요약 · AI 생성
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-pwc-ink">
                {finalSummary}
              </div>
            </section>
          )}

          {/* PR A 보강: 준비 단계 baseline 섹션. 빈 배열이면 섹션 자체 미렌더. */}
          {baselineList.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                  준비 단계 필수 점검 ({baselineList.length}건)
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {baselineList.map((content, i) => (
                  <li
                    key={`baseline-${i}`}
                    className="flex items-start gap-2 text-sm rounded-pwc px-3 py-2 border border-pwc-orange/30 bg-pwc-orange-wash"
                  >
                    <span
                      aria-hidden
                      className="mt-[2px] inline-flex w-4 h-4 shrink-0 items-center justify-center text-pwc-orange-deep"
                      title="준비 단계 필수 항목"
                    >
                      <IconLock size={12} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="leading-snug text-pwc-ink">{content}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Cycle 2 이슈 4: 체크리스트 진행 섹션 */}
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                체크리스트 진행
              </div>
              {checklist.length > 0 && (
                <div className="text-[11px] text-pwc-ink-soft">
                  {completedCount}/{checklist.length}
                </div>
              )}
            </div>
            {checklist.length === 0 ? (
              <div className="text-xs text-pwc-ink-soft bg-pwc-bg-card border border-pwc-border rounded-pwc px-3 py-3">
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
                      className={`flex items-start gap-2 text-sm rounded-pwc px-3 py-2 border ${
                        checked
                          ? "border-pwc-orange/40 bg-pwc-orange-wash"
                          : "border-pwc-border bg-pwc-bg-card"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-[2px] inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          checked
                            ? "bg-pwc-orange text-white"
                            : "bg-white text-pwc-ink-soft border border-pwc-border-strong"
                        }`}
                      >
                        {checked ? "✓" : "○"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`leading-snug ${
                            checked ? "text-pwc-ink" : "text-pwc-ink-soft"
                          }`}
                        >
                          {item.content}
                        </div>
                        {checked && item.utterance && (
                          <div
                            className="mt-1 text-[11px] text-pwc-ink-soft truncate"
                            title={item.utterance}
                          >
                            “{item.utterance}”
                          </div>
                        )}
                        {checked && time && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-pwc-ink-soft">
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
            <section className="mt-6 border-l-4 border-pwc-orange bg-pwc-orange-wash p-4">
              <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-2">
                AI 추가 확인 제안
              </div>
              <ul className="flex flex-col gap-3">
                {hazardSuggestions.map((s, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-semibold text-pwc-ink">• {s.hazard}</div>
                    <div className="text-pwc-ink-soft text-xs mt-0.5">{s.rationale}</div>
                  </li>
                ))}
              </ul>
              <button
                onClick={onClearHazardSuggestions}
                className="mt-3 w-full text-xs py-2 rounded-pwc bg-white text-pwc-ink-soft border border-pwc-border hover:text-pwc-orange hover:border-pwc-orange transition"
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
