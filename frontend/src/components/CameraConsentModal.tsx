// CameraConsentModal — PR C (Phase 2.0 MVP, c5 §9.6 / felix 결정 9).
//
// 카메라 첫 사용 시 1회 동의 모달.
// localStorage `safemate.privacy.cameraConsent.v1` 미설정이면 노출.
// 동의 시 cameraSettings.setCameraConsent(true) 저장 → 다음 진입 미표시.
//
// invariant #10: localStorage `safemate.privacy.*` 네임스페이스 — IndexedDB 미유출.

interface CameraConsentModalProps {
  open: boolean;
  onCancel: () => void;
  onConsent: () => void;
}

export function CameraConsentModal({
  open,
  onCancel,
  onConsent,
}: CameraConsentModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cameraConsentTitle"
    >
      <div className="w-full max-w-md bg-white rounded-pwc-lg shadow-pwc-card p-5">
        <h3
          id="cameraConsentTitle"
          className="font-serif-display text-[18px] text-pwc-ink mb-3"
        >
          카메라 사용 동의
        </h3>
        <div className="text-[13px] leading-relaxed text-pwc-ink space-y-2 mb-5">
          <p>
            촬영한 사진은 안전 위험 분석을 위해 OpenAI API에 전송됩니다.
          </p>
          <p>
            저장은 단말 내부(IndexedDB)에만 이뤄지며 백엔드에 영구 저장되지
            않습니다. 사진은 분석 후 즉시 폐기됩니다.
          </p>
          <p>
            <span className="font-semibold text-pwc-orange-deep">
              노동자 동의를 확인
            </span>
            한 후 진행해주세요. 얼굴이 포함된 사진은 가급적 피하시거나, 추후
            얼굴 자동 흐림 기능(Phase 2)을 사용해주세요.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-pwc bg-white text-pwc-ink-soft border border-pwc-border hover:border-pwc-orange hover:text-pwc-orange text-sm font-semibold transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConsent}
            className="flex-1 px-4 py-2.5 rounded-pwc bg-pwc-orange hover:bg-pwc-orange-deep text-white text-sm font-bold transition"
          >
            동의 · 계속
          </button>
        </div>
      </div>
    </div>
  );
}
