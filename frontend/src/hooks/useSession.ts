import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSession,
  listSessions,
  putSession,
  deleteSession as dbDeleteSession,
  clearAllSessions as dbClearAll,
  findLatestDraft,
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

  const clearAll = useCallback(async () => {
    await dbClearAll();
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, remove, clearAll };
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
