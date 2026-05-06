// CameraCapture — PR C (Phase 2.0 MVP, c5 §7).
//
// 풀스크린 모달:
//   - getUserMedia({ video: { facingMode: "environment" } }) + <video> preview
//   - 셔터 → canvas로 capture → Blob 생성 → onCapture(blob)
//   - 권한 거부 시 <input type="file" accept="image/*" capture="environment"> 폴백
//   - 닫힘 시 video track stop (mic/orphan stream 회귀 방지 — c5 §7.7)
//
// 정책:
//   - mic stream과 별도 video stream — c5 §7.7. 이 모달이 열린 동안 mic은
//     VoiceShell에서 그대로 유지됨(별도 audioStream).
//   - capture 직후 비디오 트랙 즉시 stop — 카메라 LED 끔.
//   - 캡션 입력은 CameraCapture 외부 흐름(InputDock chain)에서 처리 — 모달은
//     단순 캡처 도구.

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera, IconClose } from "./Icon";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  /** 촬영 완료 — Blob (image/jpeg or image/png from file input) + 원본 mime. */
  onCapture: (blob: Blob, mime: string, origin: "camera" | "upload") => void;
}

export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 권한 거부 폴백을 위해 file input ref도 보유.
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          // 자동재생 정책으로 차단되어도 사용자 탭으로 시작 가능.
        });
      }
    } catch (err) {
      const name = (err as { name?: string }).name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("permission");
      } else if (name === "NotFoundError") {
        setError("nodevice");
      } else {
        setError("unknown");
      }
    }
  }, []);

  // open ↔ stream lifecycle.
  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      return;
    }
    void startStream();
    return () => {
      stopStream();
    };
  }, [open, startStream, stopStream]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    setBusy(true);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        setBusy(false);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setBusy(false);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          setBusy(false);
          if (!blob) return;
          // 캡처 직후 카메라 끄기 — LED off & 모바일 배터리 보호.
          stopStream();
          onCapture(blob, "image/jpeg", "camera");
        },
        "image/jpeg",
        0.92,
      );
    } catch {
      setBusy(false);
    }
  }, [onCapture, stopStream]);

  const handleFileFallback = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onCapture(file, file.type || "image/jpeg", "upload");
      // input value를 비워 같은 파일 재선택도 가능.
      e.target.value = "";
    },
    [onCapture],
  );

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  if (!open) return null;

  const errorMessage =
    error === "permission"
      ? "카메라 권한이 거부되었습니다. 사진 파일을 직접 선택해주세요."
      : error === "nodevice"
        ? "카메라 장치를 찾을 수 없습니다. 사진 파일을 직접 선택해주세요."
        : error
          ? "카메라를 시작할 수 없습니다. 사진 파일을 직접 선택해주세요."
          : null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="카메라 촬영"
    >
      <header className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="flex items-center gap-2">
          <IconCamera size={18} />
          <span className="text-sm font-semibold">현장 사진 촬영</span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-pwc text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange"
          aria-label="카메라 닫기"
        >
          <IconClose size={18} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        {errorMessage ? (
          <div className="px-6 text-center text-white">
            <p className="text-sm mb-4">{errorMessage}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="bg-pwc-orange hover:bg-pwc-orange-deep text-white text-sm font-bold rounded-pwc px-5 py-2.5"
            >
              사진 파일 선택
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleFileFallback}
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {!errorMessage && (
        <footer className="bg-black/80 px-6 py-5 flex items-center justify-center">
          <button
            type="button"
            onClick={captureFrame}
            disabled={busy || !!error}
            className="w-16 h-16 rounded-full bg-white border-4 border-pwc-orange disabled:opacity-50 hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange"
            aria-label="촬영"
          >
            <span className="block w-12 h-12 mx-auto rounded-full bg-pwc-orange" />
          </button>
        </footer>
      )}
    </div>
  );
}
