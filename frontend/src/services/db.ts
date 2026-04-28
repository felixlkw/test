import { openDB, type IDBPDatabase } from "idb";
import type { Session } from "./sessionModel";
import { normalizeSession } from "./sessionModel";

const DB_NAME = "safemate";
const DB_VERSION = 2; // v0.2.0: polish -> english fallback, schema_version tag
const STORE = "sessions";

export interface SafeMateSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { "by-updated": string };
  };
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let migrationToastShown = false;

function getDB(): Promise<IDBPDatabase> {
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

export async function listSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE, "by-updated");
  return (all as Session[]).reverse().map(normalizeSession);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, sessionId);
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}

export async function findLatestDraft(): Promise<Session | undefined> {
  const all = await listSessions();
  return all.find((s) => s.status === "draft");
}
