// TBM(과 EHS 공통) 화면 내부 view-state 타입. 영속화 대상 아님.
// PR 1: App.tsx L11-47의 인터페이스 일부 이전.

import type { SessionDomain } from "../../services/sessionModel";

export interface AppProps {
  sessionId?: string;
  initialMode?: "TBM" | "EHS";
  initialDomain?: SessionDomain;
}

// View-only chat message (영속화는 ChatMessageRecord 사용).
// PR C — 사진 첨부 메시지 + vision 결과 메시지가 attachment_ids를 운반.
// 옵셔널이라 기존 chat 메시지(영속/일시 모두) 후방호환.
// Phase chat-PR3 — actions: 사용자에게 즉시 클릭 가능한 액션 버튼을 제공할 때만
// 부착. 영속화 안 함 (ChatMessageRecord 에는 미저장 — IndexedDB 스키마 변경 0).
// 현재 사용처: 음성 폴백 안내 메시지의 [다시 시도] / [채팅으로 계속] 버튼.
export interface ChatMessageAction {
  id: "retry_voice" | "continue_chat";
  /** 5개 언어 중 현재 언어로 이미 번역된 사용자 표시 텍스트. */
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** PR C — 첨부된 MediaAttachment.id 목록. ChatList에서 inline preview/카드. */
  attachment_ids?: string[];
  /** Phase chat-PR3 — 메시지 직후 inline 으로 그려질 액션 버튼 목록. 영속화 X. */
  actions?: ChatMessageAction[];
}

// WebRTC 이벤트 형태(루즈한 객체).
export interface WebRTCEvent {
  type: string;
  [key: string]: unknown;
}

// 화면 표시용 prior info — sessionModel.PriorInformationRecord와 동일 형태.
export interface PriorInformation {
  workLocation?: string;
  workContentDetails?: string;
  numberOfWorkers?: number;
  equipmentDetails?: string;
}

// 화면 표시용 citation — sessionModel.CitationRecord와 동일 형태.
export interface Citation {
  title: string;
  url: string;
  summary: string;
}

export interface CitationDisplay {
  citations: Citation[];
  context?: string;
  timestamp: number;
}

export type AppMode = "TBM" | "EHS";
