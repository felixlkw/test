// SuggestedQuestionChips — PR A. Read-only chip row of TBM-leader-facing
// confirmation questions derived from baseline content. Phase 2.1 will let
// leaders tap a chip to seed the run-screen voice prompt; for PR A they're
// purely informational so the screen stays form-like and predictable.

interface SuggestedQuestionChipsProps {
  questions: string[];
}

export default function SuggestedQuestionChips({
  questions,
}: SuggestedQuestionChipsProps) {
  if (!questions.length) return null;
  return (
    <div aria-label="추천 질문" className="flex flex-wrap gap-2">
      {questions.map((q, idx) => (
        <span
          key={`${idx}-${q.slice(0, 12)}`}
          className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-pwc-border text-[12px] text-pwc-ink-soft"
        >
          {q}
        </span>
      ))}
    </div>
  );
}
