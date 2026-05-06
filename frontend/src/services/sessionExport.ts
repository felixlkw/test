// sessionExport — PR D (Phase 2.0 MVP, ux_review §6 Q8 / felix Q8=B).
//
// Settings에서 모든 세션을 JSON 파일로 내보내기/가져오기.
// 정책 (felix 결정 7=A 그대로):
//   - 참석자 PII는 export에 포함되지만, IndexedDB 외부로 옮겨가는 점은 사용자가 명시 의도.
//   - 사진 attachments blob은 export에 미포함(메타만). 가져오기 시 blob_ref가 무효 → 무시.
//   - report blob도 마찬가지. report 메타만 포함되며 PDF 파일은 별도 download.
//
// 가져오기:
//   - id 충돌 시 putSession이 덮어쓰기. 안전을 위해 신규 id 발급 모드 추가.
//   - 임포트 카운트(added/skipped) 반환 — 사용자 알림용.

import { listSessions, getSession, putSession } from "./db";
import {
  type Session,
  newSessionId,
  normalizeSession,
} from "./sessionModel";

/** 모든 세션(active+archived)을 JSON Blob으로 직렬화. */
export async function exportSessions(): Promise<Blob> {
  const active = await listSessions({ includeArchived: true });
  const payload = {
    schema: "safemate-export-v1",
    exported_at: new Date().toISOString(),
    sessions: active,
  };
  const text = JSON.stringify(payload, null, 2);
  return new Blob([text], { type: "application/json" });
}

interface ImportResult {
  added: number;
  skipped: number;
}

/** 사용자가 선택한 JSON 파일을 파싱해 putSession으로 추가.
 *  id 충돌 시 새 id 발급 + 추가 (caller에 added 카운트로 보고). */
export async function importSessions(file: Blob): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 파싱 실패 — 올바른 export 파일을 선택하세요.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("올바른 export 파일이 아닙니다.");
  }
  const root = parsed as { sessions?: unknown };
  if (!Array.isArray(root.sessions)) {
    throw new Error("sessions 배열이 없습니다 — 파일이 손상되었을 수 있습니다.");
  }
  let added = 0;
  let skipped = 0;
  for (const raw of root.sessions) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    const candidate = raw as Partial<Session>;
    if (!candidate.session_id || !candidate.created_at) {
      skipped += 1;
      continue;
    }
    // id 충돌 시 새 id 발급. 동일 id가 기존에 있으면 신규 id로 추가(중복 회피).
    const existing = await getSession(candidate.session_id);
    const target: Session = normalizeSession({
      ...(candidate as Session),
      session_id: existing ? newSessionId() : candidate.session_id,
    });
    try {
      await putSession(target);
      added += 1;
    } catch {
      skipped += 1;
    }
  }
  return { added, skipped };
}
