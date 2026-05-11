import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSession,
  listSessions,
  listArchivedSessions,
  putSession,
  deleteSession as dbDeleteSession,
  clearAllSessions as dbClearAll,
  archiveSession as dbArchive,
  unarchiveSession as dbUnarchive,
  findLatestDraft,
  listDraftTbmSessions,
} from "../services/db";
import type { Session } from "../services/sessionModel";

export function useSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getSession(sessionId).then((s) => {
      if (cancelled) return;
      setSession(s ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const save = useCallback((next: Session) => {
    setSession(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void putSession(next);
    }, 300);
  }, []);

  const saveNow = useCallback(async (next: Session) => {
    setSession(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await putSession(next);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { session, loading, save, saveNow };
}

export function useSessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listSessions();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await dbDeleteSession(id);
      await refresh();
    },
    [refresh],
  );

  const archive = useCallback(
    async (id: string) => {
      await dbArchive(id);
      await refresh();
    },
    [refresh],
  );

  const unarchive = useCallback(
    async (id: string) => {
      await dbUnarchive(id);
      await refresh();
    },
    [refresh],
  );

  const clearAll = useCallback(async () => {
    await dbClearAll();
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, remove, archive, unarchive, clearAll };
}

export function useArchivedSessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listArchivedSessions();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, refresh };
}

export function useLatestDraft() {
  const [draft, setDraft] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    findLatestDraft().then((s) => {
      if (cancelled) return;
      setDraft(s ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { draft, loading };
}

/**
 * PR-feedback-1 (v0.2.2) — 홈 카운트 배지 + HistoryScreen 미완료 필터.
 * `listDraftTbmSessions`를 단일 호출하여 미완료 TBM 다건을 가져온다.
 * 홈은 `drafts.length`로 배지 가시성을 판단하고, 첫 항목으로 Resume Card를
 * 그대로 렌더할 수 있어 `useLatestDraft` 단독 호출 대체도 가능 — 다만 본
 * 사이클은 후방 호환을 위해 `useLatestDraft`를 유지하고 본 훅을 추가.
 */
export function useDraftTbmList() {
  const [drafts, setDrafts] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listDraftTbmSessions().then((list) => {
      if (cancelled) return;
      setDrafts(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { drafts, loading };
}
