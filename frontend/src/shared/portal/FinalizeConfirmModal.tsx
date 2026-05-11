// FinalizeConfirmModal — PR-feedback-3 (v0.2.3).
//
// 일부 미완(또는 skipped 포함) 상태에서 사용자가 "마치자/finalize_tbm" 시도 시
// 명시 confirm을 받는 모달. 모두 완료 시에는 호출되지 않으며, LLM "완료 처리할
// 까요?"에 사용자 동의 한마디로 finalize 흐름이 자연 진행 (felix 결정 — 강제 모달 X).
//
// 흐름:
//   1) finalize_tbm tool call 또는 사용자 "마치자" 의도 →
//      VoiceShell이 미완 카운트를 derive → 1건 이상이면 setShowFinalizeConfirm(true).
//   2) 본 모달 open. 미기입 슬롯 N + 미완 체크 M 표시 (skipped 포함 카운트 명시).
//   3) "예" → onConfirm() (VoiceShell이 setShowSummaryDrawer(true) + 후속 흐름)
//      "보강하기" → onCancel() (모달 닫기 + finishing 단계 유지)
//
// Portal 정책: z-index 30. 백드롭 클릭 → onCancel.
//
// invariant #10: 모달 토글 자체는 VoiceShell의 useState memory only. 본 컴포넌트는
// view-only.

interface FinalizeConfirmModalProps {
  open: boolean;
  /** 미기입 슬롯 수 (filled === false). */
  missingSlots: number;
  /** 미기입 체크리스트 항목 수 (completed === false && skipped !== true). */
  missingChecklist: number;
  /** skipped 처리된 체크리스트 항목 수. 안내 문구에 별도 표기. */
  skippedChecklist: number;
  /** "예 — 마치겠습니다" 클릭. */
  onConfirm: () => void;
  /** "보강하기" 또는 백드롭/ESC 닫기. */
  onCancel: () => void;
}

export function FinalizeConfirmModal({
  open,
  missingSlots,
  missingChecklist,
  skippedChecklist,
  onConfirm,
  onCancel,
}: FinalizeConfirmModalProps) {
  if (!open) return null;

  const totalIncomplete = missingSlots + missingChecklist + skippedChecklist;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: 30 }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finalize-confirm-title"
    >
      <div
        className="w-full max-w-md mx-4 bg-pwc-bg border border-pwc-border rounded-pwc-lg shadow-pwc-card overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-pwc-border bg-pwc-bg">
          <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
            TBM
          </div>
          <h2
            id="finalize-confirm-title"
            className="font-serif-display text-[18px] leading-tight mt-0.5"
          >
            마치기 전에 확인해 주세요
          </h2>
        </div>

        <div className="px-5 py-4 flex-1 text-sm text-pwc-ink leading-relaxed">
          <p className="mb-3">
            아직 다음 항목들이 정리되지 않았습니다 (총 {totalIncomplete}건).
            그래도 마치겠습니까?
          </p>
          <ul className="space-y-1.5 text-[13px]">
            {missingSlots > 0 && (
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-pwc-orange/15 text-pwc-orange-deep border border-pwc-orange/30 text-[11px] font-bold">
                  {missingSlots}
                </span>
                <span>사전정보 슬롯 미기입</span>
              </li>
            )}
            {missingChecklist > 0 && (
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-pwc-orange/15 text-pwc-orange-deep border border-pwc-orange/30 text-[11px] font-bold">
                  {missingChecklist}
                </span>
                <span>체크리스트 미점검</span>
              </li>
            )}
            {skippedChecklist > 0 && (
              <li className="flex items-start gap-2">
                <span
                  className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border-strong text-[11px] font-bold"
                  title="사용자가 명시적으로 건너뛴 항목"
                >
                  {skippedChecklist}
                </span>
                <span>건너뜀 처리된 체크리스트</span>
              </li>
            )}
          </ul>
          <p className="mt-3 text-[12px] text-pwc-ink-mute leading-snug">
            리포트에는 미기입 / 건너뜀이 그대로 표기됩니다. 감사 무결성을 위해
            "안 한 걸 했다고" 처리하지 않습니다.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-pwc-border bg-pwc-bg-card flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-pwc text-[13px] font-bold uppercase tracking-wider border border-pwc-border-strong bg-white text-pwc-ink hover:border-pwc-orange hover:text-pwc-orange transition"
          >
            보강하기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-pwc text-[13px] font-bold uppercase tracking-wider border border-pwc-orange bg-pwc-orange text-white hover:bg-pwc-orange-deep transition"
          >
            예 — 마치겠습니다
          </button>
        </div>
      </div>
    </div>
  );
}
