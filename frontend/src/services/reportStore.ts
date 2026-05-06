// reportStore — PR D (Phase 2.0 MVP, c6 §3.IX).
//
// Report PDF blob을 IndexedDB attachments store에 보관. PR C에서 신설된
// store(DB_VERSION=3)를 그대로 재사용 — 추가 마이그레이션 X (invariant #6).
//
// Session.report_ids[]는 reportStore의 record id를 가리킨다. Report 메타(format,
// generated_at)는 sessionModel.Report 타입에 보관, blob 자체는 여기.
//
// 정책:
//   - PDF는 blob 그대로 저장(평균 ~50-300 KB).
//   - JSON 리포트는 sessionModel의 Report.json_payload에 inline — 별도 blob 미생성.
//   - 영구 삭제는 deleteReport(id). 세션 단위 cascade는 db.ts deleteSession이
//     attachments by-session으로 PR C 시 이미 처리(report blob도 같은 store).

import {
  ATTACHMENTS_STORE_NAME,
  getDB,
  type AttachmentBlobRecord,
} from "./db";
import { generateAttachmentId } from "./attachmentStore";

/** PDF blob을 attachments store에 저장하고 id를 반환. caller가 Session.report_ids[]에 push. */
export async function saveReport(
  sessionId: string,
  blob: Blob,
  mime: string = "application/pdf",
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

/** Report blob 단건 조회. 미존재 시 undefined. */
export async function loadReport(reportId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = (await db.get(ATTACHMENTS_STORE_NAME, reportId)) as
    | AttachmentBlobRecord
    | undefined;
  return record?.blob;
}

/** Report 영구 삭제. attachments store key 직접 delete. */
export async function deleteReport(reportId: string): Promise<void> {
  const db = await getDB();
  await db.delete(ATTACHMENTS_STORE_NAME, reportId);
}
