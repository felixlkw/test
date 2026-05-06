// attachmentStore — PR C (Phase 2.0 MVP, c5 §7.1).
//
// IndexedDB `attachments` store 단독 read/writer. Session.attachments[]의
// MediaAttachment 메타는 sessionModel.ts에서 관리 — 여기는 binary blob의
// CRUD + 검색 인덱스(`by-session`)만 다룬다.
//
// 정책 (c5 §4.3 invariant #3):
//   - debounce 미적용. 첨부 즉시 sync 저장(blob loss 회피).
//   - key는 crypto.randomUUID() — Session.attachments[].id와 동일 값으로
//     blob_ref에도 stamp.
//   - 세션 영구 삭제 시 deleteAttachmentsBySession을 함께 호출 (c5 §9.4).
//
// 회귀 가드:
//   - DB_VERSION 인상은 db.ts에서 처리 — 본 파일은 ATTACHMENTS_STORE_NAME만
//     참조. v1/v2 사용자도 자동 업그레이드 후 store 생성됨.
//   - getDB()는 기존 dbPromise 캐시를 공유 — 동시 open 충돌 0.

import { ATTACHMENTS_STORE_NAME, getDB, type AttachmentBlobRecord } from "./db";

/** 새 첨부 저장. uuid를 생성해 반환 — caller가 MediaAttachment.id/blob_ref로 사용. */
export async function addAttachment(
  sessionId: string,
  blob: Blob,
  mime: string,
): Promise<string> {
  const id = generateAttachmentId();
  const record: AttachmentBlobRecord = {
    id,
    session_id: sessionId,
    blob,
    mime,
    size_bytes: blob.size,
    created_at: new Date().toISOString(),
  };
  const db = await getDB();
  await db.put(ATTACHMENTS_STORE_NAME, record);
  return id;
}

/** 첨부 blob 단건 조회. 미존재 시 undefined. */
export async function getAttachmentBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = (await db.get(ATTACHMENTS_STORE_NAME, id)) as
    | AttachmentBlobRecord
    | undefined;
  return record?.blob;
}

/** 첨부 메타+blob 단건 조회 (size/mime 등 함께 필요한 경우). */
export async function getAttachmentRecord(
  id: string,
): Promise<AttachmentBlobRecord | undefined> {
  const db = await getDB();
  return (await db.get(ATTACHMENTS_STORE_NAME, id)) as
    | AttachmentBlobRecord
    | undefined;
}

/** 세션 단위 전체 첨부 조회. 정렬은 created_at asc. */
export async function listAttachmentsBySession(
  sessionId: string,
): Promise<AttachmentBlobRecord[]> {
  const db = await getDB();
  const all = (await db.getAllFromIndex(
    ATTACHMENTS_STORE_NAME,
    "by-session",
    sessionId,
  )) as AttachmentBlobRecord[];
  return all
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** 첨부 단건 영구 삭제. */
export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(ATTACHMENTS_STORE_NAME, id);
}

/** 세션 단위 전체 첨부 삭제. 세션 영구 삭제 시 함께 호출 권장. */
export async function deleteAttachmentsBySession(
  sessionId: string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ATTACHMENTS_STORE_NAME, "readwrite");
  const idx = tx.store.index("by-session");
  let cursor = await idx.openCursor(sessionId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** UUID 생성 — crypto.randomUUID() 우선, 없으면 fallback (구형 브라우저 안전망). */
export function generateAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback — IE/구형 모바일 안전망.
  const rand = (n: number) =>
    Math.floor(Math.random() * Math.pow(16, n))
      .toString(16)
      .padStart(n, "0");
  return `${rand(8)}-${rand(4)}-4${rand(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rand(3)}-${rand(12)}`;
}
