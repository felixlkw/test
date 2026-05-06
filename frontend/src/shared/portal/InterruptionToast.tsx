// InterruptionToast — PR 4: pointer-events:auto + 닫기 버튼 + ESC + 5초 자동 dismiss + top:8vh.
// 5초 자동 dismiss는 useInterruption 훅이 관리(setTimeout). 이 컴포넌트는 ESC/X 클릭 → onDismiss 호출만 담당.
import { useEffect } from "react";
import { IconClose } from "../../components/Icon";

interface InterruptionToastProps {
  show: boolean;
  message: string;
  onDismiss: () => void;
}

export function InterruptionToast({ show, message, onDismiss }: InterruptionToastProps) {
  // ESC 즉시 dismiss
  useEffect(() => {
    if (!show) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [show, onDismiss]);

  if (!show || !message) return null;

  return (
    <div
      className="fixed left-0 right-0 flex justify-center"
      style={{ top: "8vh", zIndex: 30, pointerEvents: "none" }}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="relative px-6 py-4 pr-12 text-center text-2xl font-bold bg-pwc-orange text-white border-l-4 border-pwc-orange-deep shadow-lg animate-pulse rounded-pwc-lg max-w-md mx-4"
        style={{ pointerEvents: "auto" }}
      >
        {message}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="안전 경고 닫기"
          className="absolute top-2 right-2 text-white/90 hover:text-white p-1 rounded transition-colors"
        >
          <IconClose size={18} />
        </button>
      </div>
    </div>
  );
}
