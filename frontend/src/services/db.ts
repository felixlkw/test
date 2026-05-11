import { openDB, type IDBPDatabase } from "idb";
import type { Session } from "./sessionModel";
import { normalizeSession } from "./sessionModel";

const DB_NAME = "safemate";
// PR C (Phase 2.0 MVP, c5 felix 결정 6): DB_VERSION 2 → 3 인상.
// invariant #6은 본 사이클에서 architect 명시 승인 + felix HITL 승인을 받아
// 한 번만(c5 + c6 영역 V/VIII/IX 묶음) 깬다. 마이그레이션은 추가-only — 기존
// sessions store와 v1→v2 cursor walk 블록은 무수정.
const DB_VERSION = 3;
const STORE = "sessions";
// PR C: 사진 등 binary blob을 위한 별도 store.
// key = MediaAttachment.id (uuid). index by-session으로 세션 단위 cleanup.
const ATTACHMENTS_STORE = "attachments";

export interface SafeMateSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { "by-updated": string };
  };
  attachments: {
    key: string;
    value: AttachmentBlobRecord;
    indexes: { "by-session": string };
  };
}

/** PR C — IndexedDB attachments store record shape.
 *  attachmentStore.ts가 단독 read/write. Session.attachments[]의
 *  MediaAttachment 메타는 별도 — 여기는 binary blob + 검색용 메타. */
export interface AttachmentBlobRecord {
  id: string;
  session_id: string;
  blob: Blob;
  mime: string;
  size_bytes: number;
  /** ISO timestamp. */
  created_at: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let migrationToastShown = false;

/** PR C — attachmentStore.ts가 같은 db handle을 공유하도록 export. */
export function getDB(): Promise<IDBPDatabase> {
  return getDBInternal();
}

/** PR C — attachments store 이름을 한 곳에서 관리. */
export const ATTACHMENTS_STORE_NAME = ATTACHMENTS_STORE;

function getDBInternal(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "session_id" });
          store.createIndex("by-updated", "updated_at");
        }
        if (oldVersion < 2) {
          // v1 -> v2: Polish sessions fold to English; add schema_version=2.
          // Using a cursor on the existing transaction so the upgrade is atomic.
          // PR C invariant #6 보호: 이 블록은 절대 수정 금지(c6 §4.2 / c5 §13 #1).
          const store = tx.objectStore(STORE);
          let foundLegacy = false;
          void (async () => {
            let cursor = await store.openCursor();
            while (cursor) {
              const s = cursor.value as Session & { language?: string };
              let mutated = false;
              // Legacy polish sessions get folded to english (v0.1.0 -> v0.2.0).
              if ((s.language as string) === "polish") {
                s.language = "english";
                foundLegacy = true;
                mutated = true;
              }
              if (s.schema_version !== 2) {
                s.schema_version = 2;
                mutated = true;
              }
              if (s.permits === undefined) {
                s.permits = [];
                mutated = true;
              }
              if (mutated) {
                await cursor.update(s);
              }
              cursor = await cursor.continue();
            }
            if (foundLegacy && typeof window !== "undefined") {
              migrationToastShown = true;
            }
          })();
        }
        if (oldVersion < 3) {
          // PR C (c5 §4.2 — Phase 2.0 MVP) — DB_VERSION 2 → 3 인상.
          // 추가-only: 기존 sessions store는 그대로. attachments store만 신설.
          // schema_version은 2 유지(데이터 형태는 옵셔널 추가만). DB_VERSION
          // (인덱스/store 형태)과 분리 운용 — c5 §4.3 / c6 §4.2.
          // v1, v2 사용자 모두 자동으로 attachments store가 생성되며 기존
          // sessions 데이터는 손대지 않는다(invariant #6 정신 보호).
          const attachStore = db.createObjectStore(ATTACHMENTS_STORE, {
            keyPath: "id",
          });
          attachStore.createIndex("by-session", "session_id");
        }
      },
    });
  }
  return dbPromise;
}

/** True if the v1->v2 upgrade migrated at least one polish session. */
export function wasPolishMigrationApplied(): boolean {
  return migrationToastShown;
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put(STORE, {
    ...session,
    schema_version: 2,
    updated_at: new Date().toISOString(),
  });
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const db = await getDB();
  const raw = (await db.get(STORE, sessionId)) as Session | undefined;
  return raw ? normalizeSession(raw) : undefined;
}

/**
 * List sessions ordered by `updated_at` desc.
 * By default returns only active sessions (archived_at == null).
 * Pass `{ includeArchived: true }` to receive every session.
 * `findLatestDraft` relies on the default to skip archived drafts (intended).
 */
export async function listSessions(
  opts: { includeArchived?: boolean } = {},
): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE, "by-updated");
  const normalized = (all as Session[]).reverse().map(normalizeSession);
  return opts.includeArchived ? normalized : normalized.filter((s) => !s.archived_at);
}

/** Archived-only listing, sorted by archived_at desc (newest archive first). */
export async function listArchivedSessions(): Promise<Session[]> {
  const all = await listSessions({ includeArchived: true });
  return all
    .filter((s) => !!s.archived_at)
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""));
}

/** Soft archive: stamp archived_at = now and write through putSession (invariant #5). */
export async function archiveSession(sessionId: string): Promise<void> {
  const existing = await getSession(sessionId);
  if (!existing) return;
  await putSession({
    ...existing,
    archived_at: new Date().toISOString(),
  });
}

/** Unarchive: clear archived_at and write through putSession. */
export async function unarchiveSession(sessionId: string): Promise<void> {
  const existing = await getSession(sessionId);
  if (!existing) return;
  const { archived_at: _archived, ...rest } = existing;
  void _archived;
  await putSession(rest as Session);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, sessionId);
  // PR C: 세션 삭제 시 첨부 blob도 함께 정리. attachmentStore의 cursor 기반
  // by-session 삭제와 동일 동작 — 여기서는 import 사이클 회피 위해 직접 처리.
  try {
    const tx = db.transaction(ATTACHMENTS_STORE, "readwrite");
    const idx = tx.store.index("by-session");
    let cursor = await idx.openCursor(sessionId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch {
    // attachments store가 신규 사용자에서 아직 미생성된 edge case 등 — 무시.
  }
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
  // PR C: clearAllSessions는 영구 삭제 — attachments도 모두 비운다.
  try {
    await db.clear(ATTACHMENTS_STORE);
  } catch {
    // 신규 사용자 등에서 store 미존재 가드.
  }
}

export async function findLatestDraft(): Promise<Session | undefined> {
  // Uses listSessions() default (archived excluded) so archived drafts never auto-resume.
  // EHS 세션은 자동 생성된 transient Q&A 세션이라 Resume Card에 노출하지 않는다 —
  // History에서만 열람 가능. mode 미지정 legacy 세션은 TBM으로 간주(후방 호환).
  const all = await listSessions();
  return all.find(
    (s) => s.status === "draft" && (s.mode ?? "TBM") !== "EHS",
  );
}

/**
 * PR-feedback-1 (v0.2.2) — 미완료 TBM 다건 관리.
 * `findLatestDraft`와 동일 술어(`s.status === "draft"`, EHS 제외)로 N건 반환.
 * `listSessions()` 기본값으로 archived 제외, updated_at desc 정렬 보장.
 * DB_VERSION 인상 X (Invariant #6 보호) — read 전용 헬퍼.
 */
export async function listDraftTbmSessions(): Promise<Session[]> {
  const all = await listSessions();
  return all.filter(
    (s) => s.status === "draft" && (s.mode ?? "TBM") !== "EHS",
  );
}
