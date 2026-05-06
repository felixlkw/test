// SignaturePad — PR D (Phase 2.0 MVP, c6 §3.VIII, felix 결정 6=A+C 병행).
//
// signature_pad 라이브러리(~10 KB gzipped) 사용.
// 캔버스 + "지우기" / "확인" 버튼. 확인 시 toDataURL("image/png") 반환.
// 폴백: 장갑 환경에서 캔버스 그리기 불가 시 "본인 동의 확인" 체크박스 +
// "동의하고 닫기" 버튼 — signature_data_url 없이 signed=true 처리.
//
// invariant #10: 캔버스 mount/unmount 시 SignaturePadLib 인스턴스 cleanup.
// 모달 자체 view state는 부모(FinishScreen)가 관리.

import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";

interface SignaturePadProps {
  /** 모달 노출 토글 — false면 미렌더(인스턴스도 미생성). */
  open: boolean;
  /** 대상 참석자 이름(헤더 표시용). */
  attendeeName: string;
  onClose: () => void;
  /** 캔버스 서명(권장 A) 또는 confirm 폴백(권장 C). dataUrl undefined면 폴백. */
  onConfirm: (dataUrl: string | undefined) => void;
}

export function SignaturePad({
  open,
  attendeeName,
  onClose,
  onConfirm,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [confirmFallback, setConfirmFallback] = useState(false);

  // 모달이 열릴 때만 인스턴스 생성. 닫힐 때 dispose.
  useEffect(() => {
    if (!open) {
      padRef.current?.off();
      padRef.current = null;
      return;
    }
    const cv = canvasRef.current;
    if (!cv) return;
    // HiDPI 스케일링 — signature_pad 권장 패턴.
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    cv.width = cv.offsetWidth * ratio;
    cv.height = cv.offsetHeight * ratio;
    const ctx = cv.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    const pad = new SignaturePadLib(cv, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#1E1E1E",
      minWidth: 0.6,
      maxWidth: 2.4,
    });
    pad.addEventListener("endStroke", () => setHasStrokes(!pad.isEmpty()));
    padRef.current = pad;
    setHasStrokes(false);
    setConfirmFallback(false);
    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [open]);

  const handleClear = () => {
    padRef.current?.clear();
    setHasStrokes(false);
  };

  const handleConfirm = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    const dataUrl = pad.toDataURL("image/png");
    onConfirm(dataUrl);
  };

  const handleConfirmFallback = () => {
    if (!confirmFallback) return;
    onConfirm(undefined);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="서명"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-pwc-lg shadow-pwc-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
              참석자 서명
            </div>
            <div className="font-serif-display text-[18px] text-pwc-ink leading-tight">
              {attendeeName || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-pwc-ink-soft hover:text-pwc-orange text-sm font-semibold"
          >
            닫기
          </button>
        </div>

        <div className="mt-2">
          <div className="border border-pwc-border-strong rounded-pwc bg-pwc-bg-card overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full block touch-none"
              style={{ height: "180px" }}
              aria-label="서명 입력 영역"
            />
          </div>
          <p className="mt-1 text-[11px] text-pwc-ink-mute">
            손가락 또는 스타일러스로 서명하세요.
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasStrokes}
            className="px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm hover:border-pwc-orange hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed"
          >
            지우기
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasStrokes}
            className="ml-auto px-4 py-2 rounded-pwc bg-pwc-orange text-white text-sm font-semibold hover:bg-pwc-orange-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            서명 확인
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-pwc-border">
          <p className="text-[11px] text-pwc-ink-soft mb-2">
            장갑 등으로 서명이 어려우면 본인 동의 확인으로 대체할 수 있습니다.
          </p>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-pwc-ink">
            <input
              type="checkbox"
              checked={confirmFallback}
              onChange={(e) => setConfirmFallback(e.target.checked)}
              className="accent-pwc-orange"
            />
            <span>본인 동의 확인</span>
          </label>
          <button
            type="button"
            onClick={handleConfirmFallback}
            disabled={!confirmFallback}
            className="mt-2 w-full px-4 py-2 rounded-pwc border border-pwc-orange text-pwc-orange text-sm font-semibold hover:bg-pwc-orange hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            동의로 처리하고 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
