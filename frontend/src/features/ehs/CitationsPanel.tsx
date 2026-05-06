// CitationsPanel — PR 2: 전체 citations[] 누적 + 최신 펼침 + 이전은 컴팩트 스택 + "+N개 더" 토글.
// 동일한 bottom-20 슬롯을 점유 (BottomStack이 우선순위 결정).
import { useState } from "react";
import { IconClose, IconDoc } from "../../components/Icon";
import type { CitationDisplay } from "../tbm/types";

interface CitationsPanelProps {
  citations: CitationDisplay[];
  onClear: () => void;
}

export function CitationsPanel({ citations, onClear }: CitationsPanelProps) {
  const [expandedAll, setExpandedAll] = useState(false);

  if (citations.length === 0) return null;

  const total = citations.length;
  const latest = citations[total - 1];
  const previous = citations.slice(0, total - 1);
  const hiddenCount = previous.length;
  const showPrevious = expandedAll && hiddenCount > 0;

  return (
    <div className="absolute left-4 right-4 bottom-20 max-h-[60vh] overflow-y-auto bg-pwc-bg border border-pwc-border rounded-pwc-lg shadow-pwc-card z-10">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <IconDoc size={16} />
          <span className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
            관련 문서
          </span>
          {total > 1 && (
            <span className="text-[10px] text-pwc-ink-soft font-medium ml-1">
              {total}건
            </span>
          )}
          <button
            className="ml-auto text-pwc-ink-soft hover:text-pwc-orange transition-colors p-1"
            onClick={onClear}
            aria-label="Clear citations"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* 최신 1건 — 펼친 상태 */}
        {latest.context && (
          <p className="text-pwc-ink-soft text-xs mb-3">{latest.context}</p>
        )}
        <div className="space-y-2">
          {latest.citations.map((citation, index) => (
            <div
              key={`latest-${index}`}
              className="p-3 bg-pwc-bg-card border-l-2 border-pwc-orange"
            >
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pwc-ink hover:text-pwc-orange font-semibold text-sm transition-colors duration-200 block mb-1"
              >
                {citation.title}
              </a>
              <p className="text-pwc-ink-soft text-xs leading-relaxed">{citation.summary}</p>
            </div>
          ))}
        </div>

        {/* 이전 항목들 — 컴팩트 스택 + 토글 */}
        {hiddenCount > 0 && (
          <div className="mt-3 pt-3 border-t border-pwc-border">
            <button
              type="button"
              className="text-[11px] text-pwc-ink-soft hover:text-pwc-orange font-medium uppercase tracking-wider transition-colors"
              onClick={() => setExpandedAll((v) => !v)}
              aria-expanded={expandedAll}
            >
              {expandedAll ? "이전 항목 접기" : `+${hiddenCount}개 더`}
            </button>

            {showPrevious && (
              <div className="mt-2 space-y-2">
                {previous
                  .slice()
                  .reverse()
                  .map((entry, entryIdx) => (
                    <div
                      key={`prev-${entry.timestamp}-${entryIdx}`}
                      className="p-2 bg-pwc-bg-card/60 border-l border-pwc-border-strong"
                    >
                      {entry.context && (
                        <p className="text-pwc-ink-soft text-[11px] mb-1.5 leading-snug">
                          {entry.context}
                        </p>
                      )}
                      <ul className="space-y-1">
                        {entry.citations.map((c, i) => (
                          <li key={i} className="text-[11px] leading-tight">
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pwc-ink hover:text-pwc-orange font-medium"
                            >
                              {c.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
