// Cycle 4 (issue #1, felix HITL): chat-first 패러다임 전환 후 시작 화면 cue 멘트는 폐기.
// 이전 INITIAL_CUE_MESSAGES(5개 언어 모든 항목)는 모두 빈 문자열로 통일.
// 동적 cue(AI의 display_cue 툴 호출)는 별도 경로(useWebRTCEvents → setCueMessage)로 그대로 작동.
// getInitialCueMessage는 항상 빈 문자열을 반환하며, ChatList는 cueMessage가 빈 문자열일 때 system inline을 렌더하지 않는다(ChatList.tsx의 `{cueMessage && ...}` 가드).
import type { SessionLanguage } from "../../services/sessionModel";

/**
 * 초기 cue 메시지 — Cycle 4부터 모든 언어에서 빈 문자열.
 * 호출부 호환을 위해 함수 시그니처는 유지.
 */
export function getInitialCueMessage(_language: SessionLanguage): string {
  void _language;
  return "";
}

// ── Phase chat-PR3: 채팅 폴백 5언어 카피 ──────────────────────
// 음성 세션 자동 시도가 실패했을 때 사용자에게 안내. 폴백 자체는
// useTbmSession.onConnectionFailed → VoiceShell 의 setTransport("chat") 가
// 처리하고, 본 카피들은 그 직후 push 되는 안내 메시지 + 액션 버튼 라벨에
// 사용된다. felix 결정 §3 (transport 세션별) 에 맞춰 매 세션 새로 시작.

/** 음성 연결 실패 안내 본문. 5언어. */
export function getChatFallbackWarning(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Voice connection blocked. May be a corporate firewall — you can continue via chat.";
    case "vietnamese":
      return "Kết nối thoại bị chặn. Có thể do tường lửa công ty — bạn có thể tiếp tục bằng tin nhắn.";
    case "thai":
      return "การเชื่อมต่อเสียงถูกบล็อก อาจเป็นไฟร์วอลล์ของบริษัท — คุณสามารถดำเนินการต่อด้วยแชทได้";
    case "indonesian":
      return "Koneksi suara diblokir. Mungkin firewall perusahaan — Anda dapat melanjutkan dengan chat.";
    case "korean":
    default:
      return "음성 연결이 차단됐어요. 회사망/방화벽 환경일 수 있습니다. 채팅으로 계속할 수 있어요.";
  }
}

/** 음성 인증/한도 실패 안내 본문 (auth_quota 전용). 5언어. */
export function getChatFallbackWarningAuthQuota(
  language: SessionLanguage,
): string {
  switch (language) {
    case "english":
      return "Voice service is temporarily unavailable (server auth/quota). You can continue via chat.";
    case "vietnamese":
      return "Dịch vụ thoại tạm thời không khả dụng (xác thực/giới hạn máy chủ). Bạn có thể tiếp tục bằng tin nhắn.";
    case "thai":
      return "บริการเสียงไม่พร้อมใช้งานชั่วคราว (การยืนยัน/โควตาเซิร์ฟเวอร์) คุณสามารถดำเนินการต่อด้วยแชทได้";
    case "indonesian":
      return "Layanan suara sementara tidak tersedia (otentikasi/kuota server). Anda dapat melanjutkan dengan chat.";
    case "korean":
    default:
      return "음성 서비스에 일시적으로 접근할 수 없습니다 (서버 인증/한도). 채팅으로 계속하실 수 있어요.";
  }
}

/** "다시 시도" 액션 버튼 라벨 (chat → voice 재시도). 5언어. */
export function getRetryVoiceLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Retry voice";
    case "vietnamese":
      return "Thử lại giọng nói";
    case "thai":
      return "ลองใช้เสียงอีกครั้ง";
    case "indonesian":
      return "Coba lagi suara";
    case "korean":
    default:
      return "다시 시도";
  }
}

/** "채팅으로 계속" 액션 버튼 라벨. 5언어. */
export function getContinueChatLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Continue via chat";
    case "vietnamese":
      return "Tiếp tục bằng tin nhắn";
    case "thai":
      return "ดำเนินการต่อด้วยแชท";
    case "indonesian":
      return "Lanjutkan dengan chat";
    case "korean":
    default:
      return "채팅으로 계속";
  }
}

/** 채팅 모드 chip 라벨 (VoiceTopBar 우측). 5언어. */
export function getChatModeChip(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Chat mode";
    case "vietnamese":
      return "Chế độ chat";
    case "thai":
      return "โหมดแชท";
    case "indonesian":
      return "Mode chat";
    case "korean":
    default:
      return "채팅 모드";
  }
}

/** 마이크 버튼 chat 모드 tooltip — "음성 모드 다시 시도". 5언어. */
export function getMicRetryVoiceTooltip(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Retry voice mode";
    case "vietnamese":
      return "Thử lại chế độ giọng nói";
    case "thai":
      return "ลองโหมดเสียงอีกครั้ง";
    case "indonesian":
      return "Coba lagi mode suara";
    case "korean":
    default:
      return "음성 모드 다시 시도";
  }
}
