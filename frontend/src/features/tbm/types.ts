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
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** PR C — 첨부된 MediaAttachment.id 목록. ChatList에서 inline preview/카드. */
  attachment_ids?: string[];
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
