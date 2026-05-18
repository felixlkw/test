// ReportPreview — PR D (Phase 2.0 MVP, c6 §3.IX).
//
// FinishScreen 안에 인라인으로 노출되는 리포트 미리보기.
// final_summary + 8필드 + 체크리스트(completed) + 참석자 + 서명 thumbnail을
// 인쇄 가능한 layout으로 표시. PDF 생성 전 사용자 확인용.
//
// invariant #10: 펼침/접힘 등은 메모리 only.

import type {
  Attendee,
  Session,
  StructuredChecklist,
} from "../services/sessionModel";

interface ReportPreviewProps {
  session: Session;
  finalSummary: string;
  structured: StructuredChecklist;
  attendees: Attendee[];
}

const DOMAIN_LABEL: Record<string, string> = {
  manufacturing: "제조",
  construction: "건설",
  heavy_industry: "중공업",
  semiconductor: "반도체",
};

export function ReportPreview({
  session,
  finalSummary,
  structured,
  attendees,
}: ReportPreviewProps) {
  const completed = (session.checklist_items ?? []).filter((c) => c.completed);
  const allCitations = (session.citations ?? []).flatMap((c) => c.citations);

  return (
    <div className="bg-white border border-pwc-border rounded-pwc-lg shadow-pwc-card p-5 print:shadow-none">
      {/* 헤더 */}
      <header className="flex items-start justify-between border-b-2 border-pwc-orange pb-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
            Safety Vision · TBM 보고서
          </div>
          <h2 className="font-serif-display text-[20px] text-pwc-ink mt-0.5 leading-tight">
            {session.work_type_label || session.work_type || "제목 없음"}
          </h2>
          <div className="text-[11px] text-pwc-ink-soft mt-1">
            도메인: {session.domain ? DOMAIN_LABEL[session.domain] ?? session.domain : "(미지정)"}
            {" · "}
            {new Date(session.updated_at).toLocaleString("ko-KR")}
          </div>
        </div>
        <div className="text-[10px] text-pwc-ink-mute font-mono shrink-0 max-w-[140px] truncate text-right">
          {session.session_id}
        </div>
      </header>

      {/* 최종 요약 */}
      {finalSummary && (
        <section className="mb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
            최종 요약
          </h3>
          <p className="text-sm text-pwc-ink whitespace-pre-wrap leading-relaxed bg-pwc-orange-wash border-l-4 border-pwc-orange px-3 py-2">
            {finalSummary}
          </p>
        </section>
      )}

      {/* 사전 정보 */}
      <section className="mb-4">
        <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
          사전 정보
        </h3>
        <ul className="text-sm text-pwc-ink space-y-0.5">
          {session.prior_info?.workLocation && (
            <li>· 위치: {session.prior_info.workLocation}</li>
          )}
          {session.prior_info?.workContentDetails && (
            <li>· 내용: {session.prior_info.workContentDetails}</li>
          )}
          {session.prior_info?.numberOfWorkers !== undefined && (
            <li>· 작업자: {session.prior_info.numberOfWorkers}명</li>
          )}
          {session.prior_info?.equipmentDetails && (
            <li>· 장비: {session.prior_info.equipmentDetails}</li>
          )}
          {Object.keys(session.prior_info ?? {}).length === 0 && (
            <li className="text-pwc-ink-mute italic">(미입력)</li>
          )}
        </ul>
      </section>

      {/* 체크리스트 — PR-feedback-3: skipped 항목 별도 표시 (감사 무결성). */}
      {(() => {
        const items = session.checklist_items ?? [];
        const skipped = items.filter((c) => c.skipped);
        const incomplete = items.filter((c) => !c.completed && !c.skipped);
        return (
          <section className="mb-4">
            <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
              체크리스트 ({completed.length}/{items.length})
              {skipped.length > 0 && (
                <span className="ml-1 text-pwc-ink-mute font-normal normal-case tracking-normal">
                  · 건너뜀 {skipped.length}
                </span>
              )}
            </h3>
            {items.length === 0 ? (
              <p className="text-xs text-pwc-ink-mute italic">항목 없음</p>
            ) : (
              <>
                {completed.length > 0 && (
                  <ul className="text-sm text-pwc-ink space-y-0.5">
                    {completed.map((c, i) => (
                      <li key={`c-${i}`}>· {c.content}</li>
                    ))}
                  </ul>
                )}
                {skipped.length > 0 && (
                  <ul className="text-sm text-pwc-ink-mute italic space-y-0.5 mt-1.5">
                    {skipped.map((c, i) => (
                      <li key={`s-${i}`}>· {c.content} (건너뜀)</li>
                    ))}
                  </ul>
                )}
                {incomplete.length > 0 && (
                  <ul className="text-xs text-pwc-ink-mute space-y-0.5 mt-1.5">
                    {incomplete.map((c, i) => (
                      <li key={`i-${i}`}>· {c.content} (미기입)</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        );
      })()}

      {/* 8필드 */}
      <section className="mb-4">
        <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
          위험·대응 정리
        </h3>
        <Field label="오늘 작업 내용" value={structured.work_summary} />
        <Field label="평소와 달라진 점" value={structured.changes_today} />
        <Field label="주요 위험요인" value={structured.hazards} />
        <Field label="위험 시나리오" value={structured.risk_scenarios} />
        <Field label="대응/예방 조치" value={structured.mitigations} />
        <Field label="보호구/장비 확인" value={structured.ppe} />
        <Field label="특이사항" value={structured.special_notes} />
      </section>

      {/* 참석자 + 서명 */}
      <section className="mb-4">
        <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
          참석자 ({attendees.length}명)
        </h3>
        {attendees.length === 0 ? (
          <p className="text-xs text-pwc-ink-mute italic">참석자 미입력</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attendees.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 border border-pwc-border rounded-pwc px-2 py-1.5 bg-pwc-bg-card"
              >
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                    a.signed
                      ? "bg-pwc-orange text-white"
                      : "bg-white text-pwc-ink-soft border border-pwc-border-strong"
                  }`}
                >
                  {a.signed ? "✓" : "○"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-pwc-ink truncate">
                    {a.name}
                    {a.role && (
                      <span className="ml-1 text-[10px] text-pwc-ink-soft font-normal">
                        {a.role}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-pwc-ink-mute">
                    {a.signed
                      ? a.signature_data_url
                        ? "서명 완료"
                        : "동의 확인"
                      : "미서명"}
                  </div>
                </div>
                {a.signature_data_url && (
                  <img
                    src={a.signature_data_url}
                    alt={`${a.name} 서명`}
                    className="shrink-0 h-7 w-auto max-w-[64px] bg-white border border-pwc-border rounded-pwc"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 인용 출처 */}
      {allCitations.length > 0 && (
        <section className="mb-2">
          <h3 className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
            인용 출처
          </h3>
          <ul className="text-[11px] text-pwc-ink-soft space-y-0.5">
            {allCitations.map((c, i) => (
              <li key={i} className="truncate">
                · {c.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="text-[10px] text-pwc-ink-mute pt-3 mt-3 border-t border-pwc-border">
        Safety Vision · LG Innotek Industrial Safety PoC · 클라이언트 PDF 생성(오프라인)
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | string[] | undefined;
}) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return (
      <div className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-pwc-ink-mute font-bold">
          {label}
        </div>
        <div className="text-xs text-pwc-ink-mute italic">—</div>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider text-pwc-ink-mute font-bold">
        {label}
      </div>
      {Array.isArray(value) ? (
        <ul className="text-sm text-pwc-ink">
          {value.map((v, i) => (
            <li key={i}>· {v}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-pwc-ink whitespace-pre-wrap leading-snug">{value}</p>
      )}
    </div>
  );
}
