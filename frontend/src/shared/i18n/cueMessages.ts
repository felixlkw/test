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
