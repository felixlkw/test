// RecommendedQuestionsPanel — App.tsx L1574-1596 이전.
// PR 1: 동작/스타일 그대로. PR 2에서 BottomStack이 paused/collapse 제어.
interface RecommendedQuestionsPanelProps {
  show: boolean;
  questions: string[];
  animatingOut: boolean;
  onClickQuestion: (q: string) => void;
}

export function RecommendedQuestionsPanel({
  show,
  questions,
  animatingOut,
  onClickQuestion,
}: RecommendedQuestionsPanelProps) {
  if (!show || questions.length === 0) return null;
  return (
    <div className="absolute left-4 right-4 bottom-20 z-30">
      <div className="max-w-2xl mx-auto">
        <div className="space-y-2">
          {questions.map((question, index) => (
            <button
              key={`${question}-${index}`}
              className={`w-full text-left p-3 rounded-pwc bg-pwc-bg border border-pwc-border hover:border-pwc-orange hover:bg-pwc-orange-wash transition-all duration-300 shadow-pwc-card ${
                index === 0 && animatingOut ? "opacity-40 transform scale-95" : ""
              }`}
              onClick={() => onClickQuestion(question)}
              disabled={index === 0 && animatingOut}
            >
              <span className="text-pwc-ink text-sm leading-relaxed">{question}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
