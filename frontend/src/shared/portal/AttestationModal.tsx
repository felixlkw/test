// AttestationModal — Phase 2.x PR-5 (in-place 리더 서명).
//
// felix lock 6Q: Q1=A / Q2=B(미리보기 후 다운로드) / Q3=A(즉시 archive) / Q4=A /
//                Q5=A / Q6=A(한글 폰트 미설치 ASCII fallback).
//
// 흐름:
//   1) BroadcastCompleteCTA 탭(activated) → setAttestationModalOpen(true).
//   2) 본 모달 풀스크린 open. 헤더 + 1줄 요약 + (옵션) hazards top 3 bullet.
//   3) 캔버스(권장 A) 또는 "본인 동의 확인" 폴백(권장 C).
//   4) 사용자 "서명 확인" 또는 "동의로 처리하고 닫기" → onConfirm({blob, method}).
//   5) 부모(VoiceShell)가 attachment 저장 + leader_attestation stamp + PDF 생성 트리거.
//
// 구현 노트:
//   - signature_pad 라이브러리(~10 KB)를 직접 사용. SignaturePad.tsx의 모달
//     컨테이너 중첩을 피하고 본 모달 안 inline 캔버스로 통합.
//   - dataUrl → Blob 변환은 본 컴포넌트 책임. 부모는 attachments store만.
//
// Portal 정책:
//   - z-index: 30 (PortalRoot/SummaryDrawer와 동일 정책).
//   - 백드롭 클릭 → onCancel.
//   - ESC → onCancel.
//
// invariant #10: hasStrokes / confirmFallback 등 view state는 useState memory only.

import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";

export interface AttestationConfirmResult {
  /** PNG blob — canvas는 실제 서명 PNG, checkbox 폴백은 1x1 흰 placeholder PNG. */
  blob: Blob;
  /** 사용자가 사용한 방법. PDF 표지/푸터 라벨 + leader_attestation.method에 stamp. */
  method: "canvas" | "checkbox";
}

export interface AttestationModalProps {
  open: boolean;
  /** prepared_context.worker_count ?? 1. 헤더 1줄 요약에 표시. */
  workerCount: number;
  /** 요약 표시용 작업 라벨. work_type_label 우선, 없으면 work_type_id. */
  workTypeLabel: string;
  /** prepared_baseline.content[] top 3 1줄 요약 — bullet 표시. */
  hazardsSummary: string[];
  /** 서명 + 방법 결정 시 호출. 부모는 attachment 저장 + leader_attestation stamp 책임. */
  onConfirm: (result: AttestationConfirmResult) => void | Promise<void>;
  /** 백드롭/ESC/취소 버튼 — 모두 onCancel. leader_attestation 미저장 → CTA 다시 활성. */
  onCancel: () => void;
}

/** Data URL(base64 image/png) → Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const idx = dataUrl.indexOf(",");
  const meta = idx >= 0 ? dataUrl.slice(0, idx) : "";
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const mimeMatch = /data:([^;]+)/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}

/** 1x1 흰 PNG placeholder — 체크박스 폴백 시 attachments store에 저장할 빈 이미지.
 *  PDF 출력 시 "본인 동의 확인" 텍스트로 교체되므로 시각적 의미는 없음. */
function makeBlankPng(): Blob {
  // pre-encoded 1x1 white PNG (87 bytes) — 외부 렌더 0건, 합리적 placeholder.
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: "image/png" });
}

export function AttestationModal({
  open,
  workerCount,
  workTypeLabel,
  hazardsSummary,
  onConfirm,
  onCancel,
}: AttestationModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [confirmFallback, setConfirmFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ESC → onCancel.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  // 캔버스 mount/unmount + signature_pad 인스턴스 생성. SignaturePad.tsx와 동일 패턴.
  useEffect(() => {
    if (!open) {
      padRef.current?.off();
      padRef.current = null;
      return;
    }
    const cv = canvasRef.current;
    if (!cv) return;
    // HiDPI 스케일 — 모바일 가로 회전 시 offsetWidth가 갱신되도록 미니 reflow 가드.
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
    setSubmitting(false);
    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [open]);

  const handleClear = (): void => {
    padRef.current?.clear();
    setHasStrokes(false);
  };

  const handleConfirmCanvas = (): void => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    if (submitting) return;
    setSubmitting(true);
    const dataUrl = pad.toDataURL("image/png");
    const blob = dataUrlToBlob(dataUrl);
    void onConfirm({ blob, method: "canvas" });
  };

  const handleConfirmFallback = (): void => {
    if (!confirmFallback || submitting) return;
    setSubmitting(true);
    void onConfirm({ blob: makeBlankPng(), method: "checkbox" });
  };

  if (!open) return null;

  const summary = `${workTypeLabel || "작업"} · 작업자 ${workerCount}명 · 주요 위험 ${hazardsSummary.length}건`;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      style={{ zIndex: 30 }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="작업자 전파 확인"
    >
      <div
        className="w-full sm:max-w-md bg-pwc-bg text-pwc-ink border-t sm:border sm:rounded-pwc-lg border-pwc-border shadow-pwc-card overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-pwc-border bg-pwc-bg-card shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
            전파 확인 · 리더 서명
          </div>
          <div className="font-serif-display text-[20px] leading-tight mt-0.5 text-pwc-ink">
            작업자 전파 확인
          </div>
          <div className="mt-1 text-[12px] text-pwc-ink-soft">{summary}</div>
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {hazardsSummary.length > 0 && (
            <section className="mb-3 border-l-4 border-pwc-orange bg-pwc-orange-wash px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
                주요 위험 (전파 항목)
              </div>
              <ul className="flex flex-col gap-1 text-[13px] text-pwc-ink">
                {hazardsSummary.map((h, i) => (
                  <li key={`hz-${i}`} className="leading-snug">
                    · {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[12px] text-pwc-ink-soft mb-2">
            위험 전파를 마쳤음을 손가락 서명으로 확인해 주세요. 장갑 등으로
            서명이 어려우면 아래 본인 동의 체크로 대체할 수 있습니다.
          </p>

          {/* 캔버스 — HiDPI + touch-none */}
          <div className="border border-pwc-border-strong rounded-pwc bg-pwc-bg-card overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full block touch-none"
              style={{ height: "180px" }}
              aria-label="서명 입력 영역"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasStrokes || submitting}
              className="px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm hover:border-pwc-orange hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={handleConfirmCanvas}
              disabled={!hasStrokes || submitting}
              className="ml-auto px-4 py-2 rounded-pwc bg-pwc-orange text-white text-sm font-semibold hover:bg-pwc-orange-deep disabled:opacity-40 disabled:cursor-not-allowed"
            >
              서명 확인
            </button>
          </div>

          {/* 폴백 — 본인 동의 확인 체크박스 */}
          <div className="mt-4 pt-3 border-t border-pwc-border">
            <p className="text-[11px] text-pwc-ink-soft mb-2">
              장갑 등으로 서명이 어려우면 본인 동의 확인으로 대체할 수 있습니다.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-pwc-ink">
              <input
                type="checkbox"
                checked={confirmFallback}
                onChange={(e) => setConfirmFallback(e.target.checked)}
                disabled={submitting}
                className="accent-pwc-orange"
              />
              <span>본인 동의 확인</span>
            </label>
            <button
              type="button"
              onClick={handleConfirmFallback}
              disabled={!confirmFallback || submitting}
              className="mt-2 w-full px-4 py-2 rounded-pwc border border-pwc-orange text-pwc-orange text-sm font-semibold hover:bg-pwc-orange hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              동의로 처리하고 닫기
            </button>
          </div>
        </div>

        {/* 푸터 — 취소 */}
        <div className="px-5 py-3 border-t border-pwc-border bg-pwc-bg-card flex justify-end shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-pwc text-sm text-pwc-ink-soft hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
