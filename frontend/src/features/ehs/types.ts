// EHS-mode 전용 타입. PR 1: App.tsx L112-126 이전.

export interface DocumentResult {
  title: string;
  id: string;
  url: string;
  score: number;
  keywords: string[];
  content: string;
}

export interface RetrieveResponse {
  documents: DocumentResult[];
  query: string;
  total_found: number;
}
