// retention — PR D (Phase 2.0 MVP, ux_review §6 Q8).
//
// Settings "보존 기간" 옵션을 localStorage에 보관하고, HomeScreen mount 시
// 1회 만료된 archived 세션을 영구 삭제한다.
//
// invariant #10: localStorage `safemate.ui.*` 네임스페이스 — IndexedDB 누출 X.
// 정책:
//   - 미설정(또는 "infinite") → cleanup 미수행.
//   - retentionDays=N: archived_at + N일 이전인 archived 세션을 deleteSession으로 영구 삭제.
//   - active 세션은 절대 삭제 X (archived_at == null이면 무시).

import { deleteSession, listArchivedSessions } from "./db";

const KEY = "safemate.ui.retentionDays";

/** 유효 옵션 — Settings UI 셀렉트와 1:1. */
export type RetentionOption = "30" | "90" | "365" | "infinite";

/** localStorage에서 보존 기간(일) 읽기. 미설정/infinite면 null. */
export function getRetentionDays(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    if (v === "infinite") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

/** Settings에서 호출 — string 옵션 그대로 저장. */
export function setRetentionOption(opt: RetentionOption): void {
  try {
    localStorage.setItem(KEY, opt);
  } catch {
    // localStorage 비활성/quota — 동작은 무시(cleanup 미수행).
  }
}

/** 현재 raw 옵션 — UI select default 표시용. */
export function getRetentionOption(): RetentionOption {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "30" || v === "90" || v === "365" || v === "infinite") return v;
    return "infinite";
  } catch {
    return "infinite";
  }
}

/** 만료된 archived 세션을 영구 삭제. HomeScreen mount 시 1회 호출.
 *  반환: 삭제 건수 (텔레메트리/로그용 — 표시 X). */
export async function cleanupExpiredSessions(): Promise<{ deleted: number }> {
  const days = getRetentionDays();
  if (days === null) return { deleted: 0 };
  const archived = await listArchivedSessions();
  if (archived.length === 0) return { deleted: 0 };
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const s of archived) {
    const archivedAt = s.archived_at ? Date.parse(s.archived_at) : Number.NaN;
    if (Number.isFinite(archivedAt) && archivedAt < cutoff) {
      await deleteSession(s.session_id);
      deleted += 1;
    }
  }
  return { deleted };
}
