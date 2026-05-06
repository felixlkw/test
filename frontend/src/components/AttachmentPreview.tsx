// AttachmentPreview — PR C (Phase 2.0 MVP, c5 §7.1).
//
// chat 메시지 안 inline 썸네일. 클릭 시 풀스크린 lightbox.
// 메모리 누수 회피: full blob URL은 lightbox open 시점에 createObjectURL,
// close 시 revokeObjectURL.

import { useEffect, useRef, useState } from "react";
import type { MediaAttachment } from "../services/sessionModel";
import { getAttachmentBlob } from "../services/attachmentStore";
import { IconClose } from "./Icon";

interface AttachmentPreviewProps {
  attachment: MediaAttachment;
}

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lightboxOpen) {
      // close 시 ObjectURL 해제.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setFullUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const blob = await getAttachmentBlob(attachment.blob_ref);
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setFullUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [lightboxOpen, attachment.blob_ref]);

  // 컴포넌트 unmount 시 안전 cleanup.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="block max-w-[180px] rounded-pwc overflow-hidden border border-pwc-border-strong bg-pwc-bg-card hover:border-pwc-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange"
        aria-label="첨부 사진 크게 보기"
      >
        {attachment.thumbnail_data_url ? (
          <img
            src={attachment.thumbnail_data_url}
            alt={attachment.caption ?? "첨부 사진"}
            className="block w-full h-auto"
            loading="lazy"
          />
        ) : (
          <div className="px-3 py-4 text-center text-xs text-pwc-ink-mute">
            사진 (썸네일 없음)
          </div>
        )}
        {attachment.caption && (
          <div className="px-2 py-1 text-[11px] text-pwc-ink-soft text-left truncate">
            {attachment.caption}
          </div>
        )}
      </button>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[65] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            className="absolute top-3 right-3 p-2 rounded-pwc bg-black/40 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange"
            aria-label="닫기"
          >
            <IconClose size={18} />
          </button>
          {fullUrl ? (
            <img
              src={fullUrl}
              alt={attachment.caption ?? "첨부 사진"}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="text-white text-sm">불러오는 중…</div>
          )}
        </div>
      )}
    </>
  );
}
