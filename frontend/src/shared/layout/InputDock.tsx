// InputDock — Cycle 3 chat-log-centric.
// 좌측 채팅로그 toggle → 마이크 토글 (메신저 스타일).
// OFF: 회색 마이크. 사용자 음성 안 보냄(track.enabled=false).
// ON: orange 배경 + white 아이콘 + 펄스. OpenAI로 음성 송신.
// PR C: 마이크 우측에 카메라 버튼 추가. 도메인 토글 + 1회 동의 모달 → 캡처.
// PR H: 카메라 우측에 갤러리(앨범) 버튼 추가. file input(capture 없음 = 앨범 모드).
//       동일 도메인 정책(반도체 OFF) — 카메라 정책과 일관(c5 §9.5 / felix 결정 8).
//       1회 동의 모달도 동일하게 거침 — vision 분석은 외부 모델로 전송되므로
//       동일한 개인정보 안내가 필요.
import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { WebRTCSession } from "../../services/webrtc";
import type { SessionDomain, SessionLanguage } from "../../services/sessionModel";
import { IconCamera, IconImage, IconMic } from "../../components/Icon";
import { getMicRetryVoiceTooltip } from "../i18n/cueMessages";
import {
  hasCameraConsent,
  isCameraEnabled,
  setCameraConsent,
} from "../../services/cameraSettings";
import { CameraCapture } from "../../components/CameraCapture";
import { CameraConsentModal } from "../../components/CameraConsentModal";

interface InputDockProps {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  setIsInputFocused: Dispatch<SetStateAction<boolean>>;
  sendTextMessage: () => void;
  talking: "idle" | "user" | "assistant";
  sessionRef: MutableRefObject<WebRTCSession | null>;
  /** Cycle 3: 마이크 토글 상태 (shell이 owner — 메모리만, IndexedDB 미유출). */
  micEnabled: boolean;
  onToggleMic: () => void;
  /** 세션이 active이고 audioStream이 있을 때만 토글 가능. */
  canToggleMic: boolean;
  /** 첫 connect 진행 중 여부 — getUserMedia + WebRTC + ephemeral key + OpenAI POST
   *  로 ~3-5초 소요. felix HITL 2026-05-06 "음성대화 시작 반응이 느려"의 원인은
   *  실 latency보다 시각 피드백 부재 — connecting=true이면 마이크 버튼에 spin
   *  + "연결 중" tooltip을 명시해 사용자 인지 latency를 줄인다. */
  connecting?: boolean;
  /** Phase chat-PR3: 채팅 폴백 트랜스포트 여부. true 면 마이크 버튼이 "음성 모드
   *  시도" 라벨로 변경되며 클릭 시 onToggleMic 가 voice 재시도를 트리거한다. */
  chatTransport?: boolean;
  /** chat 모드 tooltip / aria-label 의 5언어 분기를 위해 현재 언어 prop 으로 주입. */
  currentLanguage?: SessionLanguage;
  // ── PR C — 카메라 ───────────────────────────────────────────────────
  /** 현재 도메인. 미지정이면 카메라 버튼 노출(legacy 후방호환). */
  currentDomain?: SessionDomain;
  /** 캡처된 사진을 부모(VoiceShell)에서 처리. mime은 image/jpeg(camera) or
   *  user-selected file의 원본 mime. 부모는 비동기 분석을 진행하며 모달은
   *  즉시 닫힘. */
  onPhotoCaptured?: (
    blob: Blob,
    mime: string,
    origin: "camera" | "upload",
  ) => void | Promise<void>;
}

export function InputDock({
  input,
  setInput,
  setIsInputFocused,
  sendTextMessage,
  talking,
  sessionRef,
  micEnabled,
  onToggleMic,
  canToggleMic,
  connecting = false,
  chatTransport = false,
  currentLanguage = "korean",
  currentDomain,
  onPhotoCaptured,
}: InputDockProps) {
  // PR C: 카메라 모달 + 동의 모달 상태(view-only — invariant #10).
  const [cameraOpen, setCameraOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  // PR H: 갤러리 → 동의 모달 통과 후 file input click 트리거 분기를 위해
  // "동의 후 어디로 갈지" 보존(ref만 — invariant #10, IndexedDB 미유출).
  const pendingActionRef = useRef<"camera" | "gallery">("camera");
  // PR H: 앨범 file input ref. 메모리 only.
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // 카메라 버튼은 (a) 도메인이 카메라 허용 + (b) 핸들러가 주입돼 있을 때만.
  const cameraButtonVisible =
    !!onPhotoCaptured && isCameraEnabled(currentDomain);
  // PR H — 갤러리도 동일 정책: 핸들러 주입 + 도메인 카메라 허용. 반도체(default OFF)
  // 에서는 갤러리도 미노출 — 개인정보 / 사이트 보안 일관성(c5 §9.5).
  const galleryButtonVisible = cameraButtonVisible;

  const openGalleryPicker = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  const handleCameraClick = useCallback(() => {
    if (!cameraButtonVisible) return;
    pendingActionRef.current = "camera";
    if (!hasCameraConsent()) {
      setConsentOpen(true);
      return;
    }
    setCameraOpen(true);
  }, [cameraButtonVisible]);

  const handleGalleryClick = useCallback(() => {
    if (!galleryButtonVisible) return;
    pendingActionRef.current = "gallery";
    if (!hasCameraConsent()) {
      setConsentOpen(true);
      return;
    }
    openGalleryPicker();
  }, [galleryButtonVisible, openGalleryPicker]);

  const handleConsentAgree = useCallback(() => {
    setCameraConsent(true);
    setConsentOpen(false);
    if (pendingActionRef.current === "gallery") {
      openGalleryPicker();
    } else {
      setCameraOpen(true);
    }
  }, [openGalleryPicker]);

  const handleConsentCancel = useCallback(() => {
    setConsentOpen(false);
  }, []);

  const handleCaptureDone = useCallback(
    (blob: Blob, mime: string, origin: "camera" | "upload") => {
      setCameraOpen(false);
      // 부모 비동기 핸들러 — 실패는 부모가 chat에 노출. 여기는 fire-and-forget.
      void Promise.resolve(onPhotoCaptured?.(blob, mime, origin));
    },
    [onPhotoCaptured],
  );

  // PR H — 갤러리 file input change. File → 부모 핸들러 호출(origin: "upload").
  // CameraCapture의 권한거부 폴백과 정확히 같은 시그니처를 사용 — 부모는 분기 없음.
  const handleGalleryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 동일 파일 재선택 가능하도록 항상 비움.
      e.target.value = "";
      if (!file) return;
      const mime = file.type && file.type.startsWith("image/")
        ? file.type
        : "image/jpeg";
      void Promise.resolve(onPhotoCaptured?.(file, mime, "upload"));
    },
    [onPhotoCaptured],
  );

  return (
    <>
      <div
        // 2026-05-06 mobile fix — gap 모바일 1.5(sm:2), px 모바일 2(sm:3) — 360px에서 5요소 충돌 방어.
        className="w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-3 bg-pwc-bg border-t border-pwc-border z-20 shrink-0"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          // 2026-05-06 felix HITL — connecting 시 회전 테두리(rounded 사각형에 border-t-transparent + animate-spin)가
          // 비대칭으로 돌아가 어색했음. 부드러운 pulse(버튼 자체 opacity 호흡)로 교체하고 micEnabled의
          // ping ring과 시각적으로 분리. 두 상태 모두 자연스럽고 명확.
          // Phase chat-PR3: chat 모드면 dashed 테두리 + 흐릿한 회색 + 클릭 시 음성 재시도.
          className={`relative w-10 h-10 shrink-0 flex items-center justify-center rounded-pwc transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange disabled:cursor-not-allowed ${
            chatTransport
              ? "bg-pwc-bg-card text-pwc-ink-mute border border-dashed border-pwc-border hover:text-pwc-orange hover:bg-pwc-orange-wash"
              : connecting
                ? "bg-pwc-orange-wash text-pwc-orange-deep border border-pwc-orange animate-pulse"
                : micEnabled
                  ? "bg-pwc-orange text-white border border-pwc-orange-deep"
                  : "bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border hover:text-pwc-orange hover:bg-pwc-orange-wash disabled:opacity-50"
          }`}
          onClick={onToggleMic}
          disabled={!canToggleMic}
          aria-label={
            chatTransport
              ? getMicRetryVoiceTooltip(currentLanguage)
              : connecting
                ? "연결 중"
                : micEnabled
                  ? "마이크 끄기"
                  : "마이크 켜기"
          }
          aria-pressed={!chatTransport && micEnabled}
          aria-busy={!chatTransport && connecting}
          title={
            chatTransport
              ? getMicRetryVoiceTooltip(currentLanguage)
              : connecting
                ? "음성 세션 연결 중... (보통 3-5초)"
                : !canToggleMic
                  ? "음성 세션 준비 중"
                  : micEnabled
                    ? "마이크 켜짐 (클릭하여 끄기)"
                    : "마이크 꺼짐 (클릭하여 켜기)"
          }
        >
          <IconMic size={18} />
          {!chatTransport && !connecting && micEnabled && (
            <span className="absolute inset-0 rounded-pwc border-2 border-pwc-orange animate-ping pointer-events-none" />
          )}
        </button>
        {cameraButtonVisible && (
          <button
            type="button"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-pwc transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border hover:text-pwc-orange hover:bg-pwc-orange-wash"
            onClick={handleCameraClick}
            aria-label="현장 사진 촬영"
            title="현장 사진 촬영"
          >
            <IconCamera size={18} />
          </button>
        )}
        {galleryButtonVisible && (
          <button
            type="button"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-pwc transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange bg-pwc-bg-card text-pwc-ink-mute border border-pwc-border hover:text-pwc-orange hover:bg-pwc-orange-wash"
            onClick={handleGalleryClick}
            aria-label="앨범에서 사진 선택"
            title="앨범에서 사진 선택"
          >
            <IconImage size={18} />
          </button>
        )}
        {/* PR H — 앨범 모드 file input. capture 속성 없음 = 디바이스 기본 picker
            (모바일에선 사진 앨범, 데스크탑에선 파일 선택). 메모리 ref만 — invariant #10. */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleGalleryChange}
        />
        <input
          className="flex-1 min-w-0 px-4 py-2.5 rounded-pwc bg-white text-pwc-ink text-sm focus:outline-none focus:ring-2 focus:ring-pwc-orange border border-pwc-border placeholder-pwc-ink-mute"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendTextMessage();
              if (talking === "assistant" && sessionRef.current) {
                sessionRef.current.interruptResponse();
              }
            }
          }}
          placeholder="메시지 입력..."
        />
        <button
          // 2026-05-06 mobile fix — px 모바일 3(sm:5) — 5요소 충돌 방어.
          className="px-3 sm:px-5 py-2.5 rounded-pwc bg-pwc-orange hover:bg-pwc-orange-deep text-white font-bold text-sm transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          onClick={sendTextMessage}
          disabled={!input.trim()}
        >
          전송
        </button>
      </div>

      {/* PR C — 1회 동의 + 캡처 모달 (view-only state, IndexedDB 미유출) */}
      <CameraConsentModal
        open={consentOpen}
        onCancel={handleConsentCancel}
        onConsent={handleConsentAgree}
      />
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCaptureDone}
      />
    </>
  );
}
