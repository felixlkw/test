// /api/retrieve & /api/retrieve-keywords fetch 래퍼.
// PR 1: App.tsx L407-450 이전. 동작 변경 없음.

import type { RetrieveResponse } from "../features/ehs/types";

export async function retrieveDocumentsByKeywords(
  keywords: string[],
): Promise<RetrieveResponse | null> {
  try {
    const response = await fetch("/api/retrieve-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as RetrieveResponse;
    return data;
  } catch (error) {
    console.error("Error retrieving documents by keywords:", error);
    return null;
  }
}

export async function retrieveDocuments(query: string): Promise<RetrieveResponse | null> {
  try {
    const response = await fetch("/api/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as RetrieveResponse;
    return data;
  } catch (error) {
    console.error("Error retrieving documents:", error);
    return null;
  }
}
