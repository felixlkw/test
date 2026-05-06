// FinishScreen — PR D (Phase 2.0 MVP, c6 §3.IX 종료 모드).
//
// progressive form. /tbm/:sessionId/finish 라우트.
// 5 섹션:
//   1. 요약 편집  (final_summary 인라인 편집)
//   2. 8-field 편집 (structured.* 인라인 편집)
//   3. 참석자 (AttendeeForm + AttendeeList + SignaturePad)
//   4. 리포트 미리보기 (ReportPreview)
//   5. CTA — PDF 내보내기 / JSON 내보내기 / TBM 종료
//
// invariants:
//   #1: PrepareScreen 패턴 — 직접 putSession + getSession 사용. useSessionPersistence X.
//       VoiceShell이 동시에 동일 세션을 쓰지 않는다(라우트 분리).
//   #4: getSession 내부에서 normalizeSession 통과.
//   #6: DB_VERSION=3 유지 — Report PDF는 attachments store(PR C 신설) 재사용.
//   #7: 모든 신규 필드(attendees, report_ids) 옵셔널.
//   #10: 모달 토글, saving, 편집 dirty flag 등은 메모리 only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession, putSession, archiveSession } from "../services/db";
import type {
  Attendee,
  Session,
  StructuredChecklist,
} from "../services/sessionModel";
import { generateSessionPdf } from "../services/pdfGenerate";
import { saveReport } from "../services/reportStore";
import TopBar from "../components/TopBar";
import RuleLine from "../components/RuleLine";
import CTAButton from "../components/CTAButton";
import { AttendeeForm } from "../components/AttendeeForm";
import { AttendeeList } from "../components/AttendeeList";
import { SignaturePad } from "../components/SignaturePad";
import { ReportPreview } from "../components/ReportPreview";

const FREQUENT_ATTENDEES_KEY = "safemate.attendees.frequent";

interface FrequentAttendee {
  name: string;
  role?: string;
  count: number;
  last_at: string;
}

function loadFrequentAttendees(): FrequentAttendee[] {
  try {
    const raw = localStorage.getItem(FREQUENT_ATTENDEES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown) => {
      if (!p || typeof p !== "object") return false;
      const obj = p as { name?: unknown };
      return typeof obj.name === "string" && obj.name.length > 0;
    });
  } catch {
    return [];
  }
}

function saveFrequentAttendees(attendees: Attendee[]): void {
  try {
    const existing = loadFrequentAttendees();
    const map = new Map<string, FrequentAttendee>();
    for (const f of existing) {
      const key = `${f.name}::${f.role ?? ""}`;
      map.set(key, f);
    }
    const now = new Date().toISOString();
    for (const a of attendees) {
      const trimmed = a.name.trim();
      if (!trimmed) continue;
      const key = `${trimmed}::${a.role ?? ""}`;
      const prev = map.get(key);
      map.set(key, {
        name: trimmed,
        role: a.role,
        count: (prev?.count ?? 0) + 1,
        last_at: now,
      });
    }
    const arr = Array.from(map.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.last_at.localeCompare(a.last_at);
      })
      .slice(0, 24);
    localStorage.setItem(FREQUENT_ATTENDEES_KEY, JSON.stringify(arr));
  } catch {
    // localStorage 비활성/quota — 무시.
  }
}

type LoadState = "loading" | "ready" | "error";

export default function FinishScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  // 편집 가능 상태 (영속 저장은 saveDraft가 putSession으로).
  const [finalSummary, setFinalSummary] = useState<string>("");
  const [structured, setStructured] = useState<StructuredChecklist>({});
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  // 모달
  const [signTargetId, setSignTargetId] = useState<string | null>(null);

  // 액션 busy
  const [exporting, setExporting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastReportInfo, setLastReportInfo] = useState<string | null>(null);

  // ── hydrate ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setLoadState("error");
      setLoadError("세션 ID가 없습니다.");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    getSession(sessionId)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setLoadState("error");
          setLoadError("세션을 찾을 수 없습니다.");
          return;
        }
        setSession(s);
        setFinalSummary(s.final_summary ?? "");
        setStructured(s.structured ?? {});
        setAttendees(s.attendees ?? []);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── frequent attendee suggestions ────────────────────────
  const suggestions = useMemo(() => {
    const list = loadFrequentAttendees();
    // 이미 추가된 항목은 suggestion에서 제외.
    const existing = new Set(attendees.map((a) => `${a.name}::${a.role ?? ""}`));
    return list
      .filter((s) => !existing.has(`${s.name}::${s.role ?? ""}`))
      .map((s) => ({ name: s.name, role: s.role }));
  }, [attendees]);

  const persist = useCallback(
    async (overrides: Partial<Session> = {}): Promise<Session | null> => {
      if (!session) return null;
      const latest = (await getSession(session.session_id)) ?? session;
      const next: Session = {
        ...latest,
        final_summary: finalSummary || latest.final_summary,
        structured: { ...(latest.structured ?? {}), ...structured },
        attendees,
        ...overrides,
      };
      await putSession(next);
      setSession(next);
      return next;
    },
    [session, finalSummary, structured, attendees],
  );

  // ── handlers ────────────────────────────────────────────
  const updateField = (key: keyof StructuredChecklist, value: unknown) => {
    setStructured((prev) => ({ ...prev, [key]: value } as StructuredChecklist));
  };

  const handleAddAttendee = (a: Attendee) => {
    setAttendees((prev) => [...prev, a]);
  };

  const handleRemoveAttendee = (id: string) => {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  };

  const handleOpenSign = (id: string) => {
    setSignTargetId(id);
  };

  const handleSignConfirm = (dataUrl: string | undefined) => {
    if (!signTargetId) return;
    const now = new Date().toISOString();
    setAttendees((prev) =>
      prev.map((a) =>
        a.id === signTargetId
          ? {
              ...a,
              signed: true,
              signed_at: now,
              signature_data_url: dataUrl ?? a.signature_data_url,
            }
          : a,
      ),
    );
    setSignTargetId(null);
  };

  const handleExportPdf = async () => {
    if (!session || exporting) return;
    setActionError(null);
    setExporting(true);
    try {
      const saved = await persist();
      if (!saved) {
        setActionError("세션 저장 실패");
        return;
      }
      const blob = await generateSessionPdf(saved, attendees);
      const reportId = await saveReport(saved.session_id, blob, "application/pdf");
      // Session.report_ids 갱신
      const nextReportIds = [...(saved.report_ids ?? []), reportId];
      await persist({ report_ids: nextReportIds });
      // 다운로드 트리거
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safemate-tbm-${saved.session_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const sizeKb = Math.round(blob.size / 1024);
      setLastReportInfo(`PDF 저장 완료 — ${sizeKb} KB`);
    } catch (err) {
      console.error("[FinishScreen] PDF export failed:", err);
      setActionError(
        err instanceof Error ? err.message : "PDF 생성 중 오류가 발생했습니다.",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    if (!session || exporting) return;
    setActionError(null);
    setExporting(true);
    try {
      const saved = await persist();
      if (!saved) {
        setActionError("세션 저장 실패");
        return;
      }
      const payload = {
        schema: "safemate-report-v1",
        generated_at: new Date().toISOString(),
        session: saved,
        attendees,
      };
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safemate-tbm-${saved.session_id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setLastReportInfo("JSON 저장 완료");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "JSON 생성 중 오류가 발생했습니다.",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFinish = async () => {
    if (!session || finishing) return;
    setActionError(null);
    setFinishing(true);
    try {
      // 자주 함께 일하는 동료 목록 갱신.
      saveFrequentAttendees(attendees);
      // 세션 저장 + status=confirmed.
      const saved = await persist({ status: "confirmed" });
      if (!saved) {
        setActionError("세션 저장 실패");
        return;
      }
      // 보관 처리 — 종료 후 active 목록에서 사라짐.
      await archiveSession(saved.session_id);
      navigate("/", { replace: true });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "TBM 종료 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setFinishing(false);
    }
  };

  // ── render ──────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-pwc-bg text-pwc-ink">
        <TopBar title="정리" />
        <div className="px-5 py-10 text-sm text-pwc-ink-mute" role="status">
          세션을 불러오는 중…
        </div>
      </div>
    );
  }
  if (loadState === "error" || !session) {
    return (
      <div className="min-h-screen bg-pwc-bg text-pwc-ink">
        <TopBar title="정리" backTo="/" />
        <div className="px-5 py-10" role="alert">
          <p className="text-sm text-pwc-orange-deep">
            {loadError ?? "세션을 불러오지 못했습니다."}
          </p>
          <CTAButton
            className="mt-4"
            variant="outline"
            block
            arrow={false}
            onClick={() => navigate("/")}
          >
            홈으로 돌아가기
          </CTAButton>
        </div>
      </div>
    );
  }

  const backTo = `/tbm/${session.session_id}/run`;

  return (
    <div className="min-h-screen bg-pwc-bg text-pwc-ink">
      <TopBar title="정리" backTo={backTo} />

      <main className="px-5 py-5 space-y-7 max-w-2xl mx-auto pb-24">
        {/* §1 — 요약 편집 */}
        <section aria-labelledby="finish-summary">
          <h2
            id="finish-summary"
            className="font-serif-display text-[20px] text-pwc-ink"
          >
            1. 요약
          </h2>
          <RuleLine className="mt-1 mb-3" />
          <textarea
            value={finalSummary}
            onChange={(e) => setFinalSummary(e.target.value)}
            placeholder="AI가 생성한 요약을 검토·편집하세요. 비어 있으면 종료 시 자동 생성됩니다."
            rows={6}
            className="w-full px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange resize-y"
          />
        </section>

        {/* §2 — 8-field structured 편집 */}
        <section aria-labelledby="finish-structured">
          <h2
            id="finish-structured"
            className="font-serif-display text-[20px] text-pwc-ink"
          >
            2. 위험·대응 정리
          </h2>
          <RuleLine className="mt-1 mb-3" />
          <div className="flex flex-col gap-3">
            <StructuredField
              label="오늘 작업 내용"
              value={structured.work_summary ?? ""}
              onChange={(v) => updateField("work_summary", v)}
            />
            <StructuredField
              label="평소와 달라진 점"
              value={structured.changes_today ?? ""}
              onChange={(v) => updateField("changes_today", v)}
            />
            <StructuredArrayField
              label="주요 위험요인"
              value={structured.hazards ?? []}
              onChange={(v) => updateField("hazards", v)}
            />
            <StructuredArrayField
              label="위험 시나리오"
              value={structured.risk_scenarios ?? []}
              onChange={(v) => updateField("risk_scenarios", v)}
            />
            <StructuredArrayField
              label="대응/예방 조치"
              value={structured.mitigations ?? []}
              onChange={(v) => updateField("mitigations", v)}
            />
            <StructuredArrayField
              label="보호구/장비 확인"
              value={structured.ppe ?? []}
              onChange={(v) => updateField("ppe", v)}
            />
            <StructuredField
              label="특이사항"
              value={structured.special_notes ?? ""}
              onChange={(v) => updateField("special_notes", v)}
            />
          </div>
        </section>

        {/* §3 — 참석자 */}
        <section aria-labelledby="finish-attendees">
          <h2
            id="finish-attendees"
            className="font-serif-display text-[20px] text-pwc-ink"
          >
            3. 참석자 ({attendees.length}명)
          </h2>
          <p className="text-xs text-pwc-ink-mute mt-1">
            이름과 역할을 추가한 뒤 ○ 아이콘을 눌러 서명 또는 본인 동의를 받으세요.
            개인정보는 단말 내부(IndexedDB)에만 저장됩니다.
          </p>
          <RuleLine className="mt-2 mb-3" />
          <div className="flex flex-col gap-3">
            <AttendeeForm onAdd={handleAddAttendee} suggestions={suggestions} />
            <AttendeeList
              attendees={attendees}
              onRemove={handleRemoveAttendee}
              onSign={handleOpenSign}
            />
          </div>
        </section>

        {/* §4 — 리포트 미리보기 */}
        <section aria-labelledby="finish-preview">
          <h2
            id="finish-preview"
            className="font-serif-display text-[20px] text-pwc-ink"
          >
            4. 미리보기
          </h2>
          <RuleLine className="mt-1 mb-3" />
          <ReportPreview
            session={{ ...session, final_summary: finalSummary }}
            finalSummary={finalSummary}
            structured={structured}
            attendees={attendees}
          />
        </section>

        {/* §5 — CTA */}
        <section aria-labelledby="finish-cta" className="pt-1">
          <h2 id="finish-cta" className="sr-only">
            내보내기 및 종료
          </h2>
          {actionError && (
            <div
              role="alert"
              className="mb-3 text-sm text-pwc-orange-deep border border-pwc-orange-deep/40 rounded-pwc px-3 py-2"
            >
              {actionError}
            </div>
          )}
          {lastReportInfo && (
            <div className="mb-3 text-xs text-pwc-ink-soft border border-pwc-border rounded-pwc px-3 py-2 bg-pwc-bg-card">
              {lastReportInfo}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <CTAButton
              block
              variant="outline"
              arrow={false}
              disabled={exporting || finishing}
              onClick={() => void handleExportPdf()}
            >
              {exporting ? "처리 중…" : "PDF 내보내기"}
            </CTAButton>
            <CTAButton
              block
              variant="outline"
              arrow={false}
              disabled={exporting || finishing}
              onClick={() => void handleExportJson()}
            >
              JSON 내보내기
            </CTAButton>
            <CTAButton
              block
              disabled={exporting || finishing}
              onClick={() => void handleFinish()}
            >
              {finishing ? "종료 처리 중…" : "TBM 종료"}
            </CTAButton>
          </div>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            "TBM 종료" 시 세션이 확정되고 보관함으로 이동합니다. 영구 삭제는
            설정에서 가능합니다.
          </p>
        </section>
      </main>

      <SignaturePad
        open={signTargetId !== null}
        attendeeName={
          attendees.find((a) => a.id === signTargetId)?.name ?? ""
        }
        onClose={() => setSignTargetId(null)}
        onConfirm={handleSignConfirm}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

function StructuredField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-pwc-ink-mute font-bold block mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange resize-y"
      />
    </div>
  );
}

function StructuredArrayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  // 줄바꿈으로 split — 입력 단순성 우선.
  const text = value.join("\n");
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-pwc-ink-mute font-bold block mb-1">
        {label}{" "}
        <span className="text-pwc-ink-mute font-normal normal-case tracking-normal">
          (줄바꿈으로 항목 구분)
        </span>
      </label>
      <textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          onChange(next);
        }}
        rows={Math.max(2, value.length || 2)}
        className="w-full px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange resize-y"
      />
    </div>
  );
}
