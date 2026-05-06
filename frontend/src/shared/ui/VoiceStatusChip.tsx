// VoiceStatusChip — VoiceTopBar 작은 인디케이터.
// PR B+ Cleanup (felix lock §6 Q7=A): App.css `.compact-voice-btn` 잔재 제거.
// 동일 시각 효과(orange active / connecting opacity / talking glow)를 PwC
// Tailwind 토큰만으로 재구성. Samsung-blue 잔재 0, 하드코딩 hex 0.
interface VoiceStatusChipProps {
  sessionActive: boolean;
  connecting: boolean;
  talking: "idle" | "user" | "assistant";
  onClickStart: () => void;
  onClickStop: () => void;
}

// 2026-05-06 mobile fix — 모바일은 아이콘만(텍스트 sr-only), 데스크톱은 아이콘+텍스트.
// padding 모바일 컴팩트(px-2 → sm:px-3) — 360px 폭에서 가로 점유율 축소.
const BASE =
  "inline-flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-pwc " +
  "text-[12px] font-bold uppercase tracking-wider border transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange " +
  "disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap";

function variantClass(
  sessionActive: boolean,
  connecting: boolean,
  talking: "idle" | "user" | "assistant",
): string {
  if (connecting) {
    return "bg-pwc-bg-card text-pwc-ink-soft border-pwc-border";
  }
  if (talking === "user") {
    return (
      "bg-pwc-orange text-white border-pwc-orange-deep " +
      "shadow-[0_0_0_4px_rgba(224,48,30,0.15)] animate-pulse"
    );
  }
  if (talking === "assistant") {
    return (
      "bg-white text-pwc-orange-deep border-pwc-orange " +
      "shadow-[0_0_0_4px_rgba(224,48,30,0.10)] animate-pulse"
    );
  }
  if (sessionActive) {
    return "bg-white text-pwc-orange-deep border-pwc-orange hover:bg-pwc-orange-wash";
  }
  return "bg-pwc-orange text-white border-pwc-orange-deep hover:bg-pwc-orange-deep";
}

export function VoiceStatusChip({
  sessionActive,
  connecting,
  talking,
  onClickStart,
  onClickStop,
}: VoiceStatusChipProps) {
  return (
    <button
      type="button"
      className={`${BASE} ${variantClass(sessionActive, connecting, talking)}`}
      onClick={sessionActive ? onClickStop : onClickStart}
      disabled={connecting}
      aria-label={sessionActive ? "음성 세션 중지" : "음성 세션 시작"}
      aria-pressed={sessionActive}
    >
      {connecting ? (
        <svg
          viewBox="0 0 50 50"
          width={16}
          height={16}
          className="animate-spin"
          aria-hidden="true"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeDasharray="31.4 31.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 16a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4zm5-4a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
        </svg>
      )}
      <span className="ml-1 hidden sm:inline">
        {connecting ? "..." : sessionActive ? "중지" : "시작"}
      </span>
      {/* 모바일 SR-only — 시각적 텍스트 없음, screen reader는 동일 라벨 인지. */}
      <span className="sr-only sm:hidden">
        {connecting ? "연결 중" : sessionActive ? "중지" : "시작"}
      </span>
    </button>
  );
}
