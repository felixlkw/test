// HazardSuggestionList — SummaryDrawer 안에 inline으로 들어있던 부분을 분리.
// PR 1: 동작 변경 0. SummaryDrawer가 그대로 사용 중이지만 재사용 컴포넌트로도 노출.
interface HazardSuggestionListProps {
  suggestions: { hazard: string; rationale: string }[];
  onClear: () => void;
}

export function HazardSuggestionList({ suggestions, onClear }: HazardSuggestionListProps) {
  if (suggestions.length === 0) return null;
  return (
    <section className="mt-6 border-l-4 border-hoban-primary bg-hoban-primary-wash p-4">
      <div className="text-[11px] uppercase tracking-wider text-hoban-primary font-bold mb-2">
        AI 추가 확인 제안
      </div>
      <ul className="flex flex-col gap-3">
        {suggestions.map((s, i) => (
          <li key={i} className="text-sm">
            <div className="font-semibold text-hoban-ink">• {s.hazard}</div>
            <div className="text-hoban-ink-soft text-xs mt-0.5">{s.rationale}</div>
          </li>
        ))}
      </ul>
      <button
        onClick={onClear}
        className="mt-3 w-full text-xs py-2 rounded-hoban bg-white text-hoban-ink-soft border border-hoban-border hover:text-hoban-primary hover:border-hoban-primary transition"
      >
        제안 닫기
      </button>
    </section>
  );
}
