// ReportPreviewModal — Phase 2.x PR-6 (felix Q2=B 미리보기 후 다운로드).
//
// 흐름:
//   1) AttestationModal onConfirm → 부모가 PDF 생성 시작 → setReportPreviewOpen(true).
//   2) 부모 useEffect가 generateBroadcastReportPdf → setReportPdfBlob(blob).
//   3) 본 모달이 blob URL을 iframe/embed로 표시.
//   4) 사용자 "다운로드" 탭 → onDownload → triggerDownload + 후속 archive + Home navigate.
//
// iOS Safari 호환:
//   - <embed type="application/pdf"> 우선. 일부 모바일 Safari는 inline PDF 뷰어
//     미지원 → "PDF 다운로드 후 외부 앱으로 열기" 안내 fallback.
//   - createObjectURL → 모달 unmount 시 cleanup useEffect로 revoke.
//
// invariant #10: blobUrl 메모리 only. PDF blob 자체는 부모(VoiceShell)가 owner.

import { useEffect, useState } from "react";

export interface ReportPreviewModalProps {
  open: boolean;
  /** 부모가 PDF 생성 후 set. null인 동안 "생성 중…" 노출. */
  pdfBlob: Blob | null;
  /** 다운로드 시 사용. PR-6 buildBroadcastReportFilename. */
  filename: string;
  /** 다운로드 탭 시. 부모는 triggerDownload + report 저장 + archive + Home navigate. */
  onDownload: () => void | Promise<void>;
  /** 닫기/취소 — 부모는 미리보기 state 초기화. */
  onClose: () => void;
}

export function ReportPreviewModal({
  open,
  pdfBlob,
  filename,
  onDownload,
  onClose,
}: ReportPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // pdfBlob이 변경되면 URL 갱신 + 이전 URL revoke.
  useEffect(() => {
    if (!open || !pdfBlob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setBlobUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    };
  }, [open, pdfBlob]);

  // ESC → onClose.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownloadClick = async (): Promise<void> => {
    if (downloading || !pdfBlob) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      // 부모가 모달을 닫을 가능성이 큼 — flag만 리셋.
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center"
      style={{ zIndex: 30 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="TBM 전파 확인서 미리보기"
    >
      <div
        className="w-full h-full sm:w-[92vw] sm:h-[92vh] sm:max-w-3xl bg-pwc-bg text-pwc-ink border border-pwc-border sm:rounded-pwc-lg shadow-pwc-card overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-pwc-border bg-pwc-bg-card shrink-0 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
              PDF 미리보기
            </div>
            <div className="font-serif-display text-[16px] leading-tight text-pwc-ink">
              TBM 전파 확인서
            </div>
            <div className="text-[11px] text-pwc-ink-soft truncate" title={filename}>
              {filename || "(파일명 생성 중)"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="text-pwc-ink-soft hover:text-pwc-orange text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="미리보기 닫기"
          >
            닫기
          </button>
        </div>

        {/* PDF 뷰어 */}
        <div className="flex-1 min-h-0 bg-pwc-bg-soft overflow-hidden">
          {!pdfBlob || !blobUrl ? (
            <div className="w-full h-full flex items-center justify-center text-pwc-ink-soft text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-pwc-orange animate-pulse" />
                <span>PDF를 생성하는 중…</span>
              </div>
            </div>
          ) : (
            <object
              data={blobUrl}
              type="application/pdf"
              className="w-full h-full"
              aria-label="TBM 전파 확인서 PDF"
            >
              {/* iOS Safari 등 inline PDF 미지원 환경 fallback */}
              <div className="w-full h-full flex items-center justify-center px-4 text-center text-pwc-ink-soft text-sm">
                <div>
                  <p className="mb-2">
                    이 브라우저에서는 PDF 미리보기가 표시되지 않을 수 있습니다.
                  </p>
                  <p>아래 다운로드 버튼으로 받아 외부 앱에서 열어 주세요.</p>
                </div>
              </div>
            </object>
          )}
        </div>

        {/* 푸터 — 취소 + 다운로드 */}
        <div className="px-5 py-3 border-t border-pwc-border bg-pwc-bg-card shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="px-4 py-2 rounded-pwc text-sm text-pwc-ink-soft hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadClick()}
            disabled={!pdfBlob || downloading}
            className="px-4 py-2 rounded-pwc bg-pwc-orange text-white text-sm font-bold hover:bg-pwc-orange-deep disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {downloading ? "처리 중…" : "다운로드"}
          </button>
        </div>
      </div>
    </div>
  );
}
