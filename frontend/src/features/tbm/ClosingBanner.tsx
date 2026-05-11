// ClosingBanner — PR-feedback-3 (v0.2.3).
//
// finishing 단계 진입(closingDetector 트리거 충족) 시 채팅 영역 위에 노출되는
// 얇은 sticky 배너 1줄. "마무리 임박 — 미기입 N개 (자세히 보기)" 형태.
// 클릭 시 ChecklistPanel을 missingOnly=true 모드로 open. 닫기 가능, 강제 모달 X.
//
// 사용자 통제권 보존 — 강제 모달이나 흐름 차단 X. LLM 1문장 환기는 backend
// prompt가 [Closing Reminder] inject 받아 처리.

import { IconClose } from "../../components/Icon";

interface ClosingBannerProps {
  /** finishing 단계 + 닫기 안 한 상태에서만 true. */
  show: boolean;
  /** 미기입 슬롯 + 미점검 체크리스트 합 (skipped 제외). */
  missingCount: number;
  /** "자세히 보기" 클릭 — VoiceShell이 ChecklistPanel missingOnly open. */
  onOpenDetails: () => void;
  /** 닫기 버튼 — 다시 안 뜸 (세션 한정). */
  onDismiss: () => void;
}

export function ClosingBanner({
  show,
  missingCount,
  onOpenDetails,
  onDismiss,
}: ClosingBannerProps) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-pwc-orange-wash border-b border-pwc-orange/40 px-3 py-1.5 flex items-center gap-2 shrink-0"
    >
      <span aria-hidden="true" className="shrink-0 text-pwc-orange-deep">
        ⏱
      </span>
      <div className="flex-1 min-w-0 text-[12px] text-pwc-ink leading-snug">
        <span className="font-semibold">마무리 임박</span>
        {missingCount > 0 ? ` — 미기입 ${missingCount}개` : " — 모두 정리됨"}
      </div>
      {missingCount > 0 && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-pwc-orange-deep hover:text-pwc-orange-deep underline decoration-pwc-orange/40 hover:decoration-pwc-orange transition px-1"
        >
          자세히 보기
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="마무리 임박 안내 닫기"
        className="shrink-0 text-pwc-ink-mute hover:text-pwc-orange-deep transition p-1"
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
