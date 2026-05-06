import { useEffect, useRef, useState } from "react";
import TopBar from "../components/TopBar";
import RuleLine from "../components/RuleLine";
import { useSessionList, useArchivedSessionList } from "../hooks/useSession";
import { deleteSession as dbDeleteSession } from "../services/db";
import {
  ALL_DOMAINS,
  DOMAIN_LABEL_KO,
  isAiContextEnabled,
  setAiContextEnabled,
} from "../services/aiSettings";
import {
  isCameraEnabled,
  setCameraEnabled,
} from "../services/cameraSettings";
import type { SessionDomain } from "../services/sessionModel";
import {
  exportSessions,
  importSessions,
} from "../services/sessionExport";
import {
  getRetentionOption,
  setRetentionOption,
  type RetentionOption,
} from "../services/retention";

// PR D Q8 — 운영 섹션 localStorage 키.
const DEFAULT_DOMAIN_KEY = "safemate.ui.defaultDomain";

function getDefaultDomain(): SessionDomain | "" {
  try {
    const v = localStorage.getItem(DEFAULT_DOMAIN_KEY);
    if (v === "manufacturing" || v === "construction" || v === "heavy_industry" || v === "semiconductor") {
      return v;
    }
    return "";
  } catch {
    return "";
  }
}

function setDefaultDomain(d: SessionDomain | ""): void {
  try {
    if (!d) {
      localStorage.removeItem(DEFAULT_DOMAIN_KEY);
    } else {
      localStorage.setItem(DEFAULT_DOMAIN_KEY, d);
    }
  } catch {
    // localStorage 비활성/quota — 무시.
  }
}

export default function SettingsScreen() {
  const { sessions, clearAll, refresh: refreshActive } = useSessionList();
  const { sessions: archivedSessions, refresh: refreshArchived } = useArchivedSessionList();
  const [busy, setBusy] = useState(false);
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  const appVersion = import.meta.env.VITE_APP_VERSION ?? "dev";

  // PR A_v2-3 — 도메인별 "AI 컨텍스트 활용" 토글 (felix decision §12-#7).
  // 초기값은 localStorage 또는 기본 (반도체 OFF / 그 외 ON).
  const [aiContextByDomain, setAiContextByDomain] = useState<Record<SessionDomain, boolean>>(() => {
    const out = {} as Record<SessionDomain, boolean>;
    for (const d of ALL_DOMAINS) out[d] = isAiContextEnabled(d);
    return out;
  });

  const toggleDomainAiContext = (domain: SessionDomain) => {
    setAiContextByDomain((prev) => {
      const next = { ...prev, [domain]: !prev[domain] };
      setAiContextEnabled(domain, next[domain]);
      return next;
    });
  };

  // PR C — 도메인별 "카메라 사용 허용" 토글 (felix 결정 8).
  // 반도체 default OFF — 그 외 도메인 ON.
  const [cameraByDomain, setCameraByDomain] = useState<Record<SessionDomain, boolean>>(() => {
    const out = {} as Record<SessionDomain, boolean>;
    for (const d of ALL_DOMAINS) out[d] = isCameraEnabled(d);
    return out;
  });

  const toggleDomainCamera = (domain: SessionDomain) => {
    setCameraByDomain((prev) => {
      const next = { ...prev, [domain]: !prev[domain] };
      setCameraEnabled(domain, next[domain]);
      return next;
    });
  };

  // PR D Q8 — 운영 옵션 (default domain / retention / export / import).
  const [defaultDomain, setDefaultDomainState] = useState<SessionDomain | "">(getDefaultDomain);
  const [retention, setRetention] = useState<RetentionOption>(getRetentionOption);
  const [opMessage, setOpMessage] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [opBusy, setOpBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDefaultDomainChange = (v: string) => {
    const d = (v as SessionDomain | "") || "";
    setDefaultDomainState(d);
    setDefaultDomain(d);
  };

  const handleRetentionChange = (v: string) => {
    if (v !== "30" && v !== "90" && v !== "365" && v !== "infinite") return;
    setRetention(v);
    setRetentionOption(v);
  };

  const handleExport = async () => {
    setOpError(null);
    setOpMessage(null);
    setOpBusy(true);
    try {
      const blob = await exportSessions();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safemate-sessions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setOpMessage("세션 export 완료");
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Export 실패");
    } finally {
      setOpBusy(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능.
    if (!file) return;
    setOpError(null);
    setOpMessage(null);
    setOpBusy(true);
    try {
      const result = await importSessions(file);
      await refreshActive();
      await refreshArchived();
      setOpMessage(`Import 완료 — 추가 ${result.added}건 / 건너뜀 ${result.skipped}건`);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Import 실패");
    } finally {
      setOpBusy(false);
    }
  };

  // PR 6: fetch backend /api/health version once. Graceful omit on failure.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (j && typeof j.version === "string") {
          setBackendVersion(j.version);
        }
      })
      .catch(() => {
        // Backend offline — silently omit the row, no console noise.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2-step confirm: ① soft confirm, ② prompt for exact "삭제" string match.
  const handleDeleteArchived = async () => {
    const count = archivedSessions.length;
    if (count === 0) return;
    if (!confirm(`보관된 ${count}개 세션을 영구 삭제합니다. 복구할 수 없습니다.`)) return;
    const typed = prompt('확인을 위해 "삭제"를 입력하세요');
    if (typed !== "삭제") return;
    setBusy(true);
    for (const s of archivedSessions) {
      // Direct deleteSession path; bypass active list refresh per item.
      await dbDeleteSession(s.session_id);
    }
    await refreshArchived();
    await refreshActive();
    setBusy(false);
    alert(`보관된 세션 ${count}개를 영구 삭제했습니다.`);
  };

  const handleClearAll = async () => {
    const total = sessions.length + archivedSessions.length;
    if (total === 0) return;
    if (!confirm(`활성 + 보관 모든 세션 ${total}개를 영구 삭제합니다. 복구할 수 없습니다.`)) return;
    const typed = prompt('확인을 위해 "삭제"를 입력하세요');
    if (typed !== "삭제") return;
    setBusy(true);
    await clearAll();
    await refreshArchived();
    setBusy(false);
    alert("모든 로컬 데이터를 삭제했습니다.");
  };

  return (
    <div className="w-full min-h-screen bg-pwc-bg text-pwc-ink flex flex-col">
      <TopBar title="설정" backTo="/" />

      <div className="flex-1 px-5 py-6 flex flex-col gap-8">
        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">앱 정보</h2>
          <RuleLine className="mt-2 mb-4" />
          <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
            <span className="text-pwc-ink-soft">앱 버전</span>
            <span className="font-semibold">{appVersion}</span>
          </div>
          {backendVersion && (
            <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
              <span className="text-pwc-ink-soft">백엔드 버전</span>
              <span className="font-semibold">{backendVersion}</span>
            </div>
          )}
          <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
            <span className="text-pwc-ink-soft">활성 세션</span>
            <span className="font-semibold">{sessions.length}개</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-pwc-border">
            <span className="text-pwc-ink-soft">보관된 세션</span>
            <span className="font-semibold">{archivedSessions.length}개</span>
          </div>
          <div className="flex justify-between text-sm py-2">
            <span className="text-pwc-ink-soft">빌드</span>
            <span className="font-semibold">PwC Brand · Light</span>
          </div>
        </section>

        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">AI 컨텍스트 활용</h2>
          <RuleLine className="mt-2 mb-4" />
          <p className="text-[12px] text-pwc-ink-soft mb-3">
            도메인별로 PrepareScreen 컨텍스트 입력(작업자 수·풍속·신규 자재 등)을
            LLM에 전달할지 선택합니다.
          </p>
          <ul className="divide-y divide-pwc-border border border-pwc-border rounded-pwc bg-white">
            {ALL_DOMAINS.map((d) => {
              const enabled = aiContextByDomain[d];
              return (
                <li
                  key={d}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-semibold text-pwc-ink">
                    {DOMAIN_LABEL_KO[d]}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${DOMAIN_LABEL_KO[d]} AI 컨텍스트 활용 ${enabled ? "사용 안 함으로 전환" : "사용함으로 전환"}`}
                    onClick={() => toggleDomainAiContext(d)}
                    className={[
                      "relative inline-flex items-center gap-2 rounded-pwc px-3 py-1.5 text-[12px] font-semibold transition border",
                      enabled
                        ? "bg-pwc-orange text-white border-pwc-orange hover:bg-pwc-orange-deep"
                        : "bg-white text-pwc-ink-soft border-pwc-border hover:border-pwc-orange",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block w-2 h-2 rounded-full",
                        enabled ? "bg-white" : "bg-pwc-ink-mute",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    {enabled ? "사용함" : "사용 안 함"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            OFF 시 PrepareScreen 컨텍스트 입력이 LLM에 전달되지 않습니다.
            baseline 추천은 정적 카탈로그만 사용합니다. (반도체 기본 OFF)
          </p>
        </section>

        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">카메라 사용 허용</h2>
          <RuleLine className="mt-2 mb-4" />
          <p className="text-[12px] text-pwc-ink-soft mb-3">
            도메인별로 사진 분석 캡처를 허용할지 선택합니다. OFF 시 RunScreen
            카메라 버튼이 노출되지 않습니다. (반도체 기본 OFF — 영업비밀/사이트
            보안)
          </p>
          <ul className="divide-y divide-pwc-border border border-pwc-border rounded-pwc bg-white">
            {ALL_DOMAINS.map((d) => {
              const enabled = cameraByDomain[d];
              return (
                <li
                  key={d}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-semibold text-pwc-ink">
                    {DOMAIN_LABEL_KO[d]}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${DOMAIN_LABEL_KO[d]} 카메라 사용 ${enabled ? "사용 안 함으로 전환" : "사용함으로 전환"}`}
                    onClick={() => toggleDomainCamera(d)}
                    className={[
                      "relative inline-flex items-center gap-2 rounded-pwc px-3 py-1.5 text-[12px] font-semibold transition border",
                      enabled
                        ? "bg-pwc-orange text-white border-pwc-orange hover:bg-pwc-orange-deep"
                        : "bg-white text-pwc-ink-soft border-pwc-border hover:border-pwc-orange",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block w-2 h-2 rounded-full",
                        enabled ? "bg-white" : "bg-pwc-ink-mute",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    {enabled ? "사용함" : "사용 안 함"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            촬영한 사진은 안전 위험 분석을 위해 OpenAI API에 전송되며, 단말
            내부(IndexedDB)에만 저장됩니다.
          </p>
        </section>

        {/* PR D Q8 (OLD-M14) — 운영 옵션. */}
        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">운영</h2>
          <RuleLine className="mt-2 mb-4" />

          {/* default domain */}
          <div className="flex items-center justify-between gap-3 py-2 border-b border-pwc-border">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-pwc-ink">기본 도메인</div>
              <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                새 TBM 시작 시 자동 적용. "선택 안 함"이면 기존 도메인 시트 노출.
              </div>
            </div>
            <select
              value={defaultDomain}
              onChange={(e) => handleDefaultDomainChange(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-pwc border border-pwc-border-strong bg-white focus:outline-none focus:border-pwc-orange"
              aria-label="기본 도메인 선택"
            >
              <option value="">선택 안 함</option>
              {ALL_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_LABEL_KO[d]}
                </option>
              ))}
            </select>
          </div>

          {/* retention */}
          <div className="flex items-center justify-between gap-3 py-2 border-b border-pwc-border">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-pwc-ink">보존 기간</div>
              <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                보관된 세션은 설정한 기간 이후 자동 영구 삭제. 활성 세션은 영향 없음.
              </div>
            </div>
            <select
              value={retention}
              onChange={(e) => handleRetentionChange(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-pwc border border-pwc-border-strong bg-white focus:outline-none focus:border-pwc-orange"
              aria-label="보존 기간 선택"
            >
              <option value="30">30일</option>
              <option value="90">90일</option>
              <option value="365">1년</option>
              <option value="infinite">무기한</option>
            </select>
          </div>

          {/* export / import */}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={opBusy || sessions.length + archivedSessions.length === 0}
              className="w-full rounded-pwc border border-pwc-border-strong bg-white text-pwc-ink py-2.5 text-sm font-semibold hover:border-pwc-orange hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              세션 export (JSON)
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              disabled={opBusy}
              className="w-full rounded-pwc border border-pwc-border-strong bg-white text-pwc-ink py-2.5 text-sm font-semibold hover:border-pwc-orange hover:text-pwc-orange disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              세션 import (JSON)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
              aria-hidden="true"
            />
            {opMessage && (
              <p className="text-[11px] text-pwc-ink-soft border border-pwc-border rounded-pwc px-2 py-1.5 bg-pwc-bg-card">
                {opMessage}
              </p>
            )}
            {opError && (
              <p className="text-[11px] text-pwc-orange-deep border border-pwc-orange-deep/40 rounded-pwc px-2 py-1.5">
                {opError}
              </p>
            )}
            <p className="text-[11px] text-pwc-ink-mute">
              사진/리포트 PDF blob은 export에 포함되지 않습니다. import 시 ID 충돌
              세션은 새 ID로 추가됩니다.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">보관함</h2>
          <RuleLine className="mt-2 mb-4" />
          <p className="text-[12px] text-pwc-ink-soft mb-3">
            보관된 세션 {archivedSessions.length}개. 보관 후에는 이력 목록에서 보이지 않으나
            기기에는 남아 있습니다.
          </p>
          <button
            onClick={handleDeleteArchived}
            disabled={busy || archivedSessions.length === 0}
            className="w-full rounded-pwc bg-pwc-orange text-white py-3 text-sm font-semibold active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pwc-orange-deep"
          >
            보관함 영구 삭제 →
          </button>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            보관된 세션만 영구 삭제됩니다. 활성 세션은 영향 없음.
          </p>
        </section>

        <section>
          <h2 className="font-serif-display text-[20px] text-pwc-ink">데이터</h2>
          <RuleLine className="mt-2 mb-4" />
          <button
            onClick={handleClearAll}
            disabled={busy || sessions.length + archivedSessions.length === 0}
            className="w-full rounded-pwc bg-pwc-orange text-white py-3 text-sm font-semibold active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pwc-orange-deep"
          >
            활성 + 보관 모든 세션 영구 삭제 →
          </button>
          <p className="text-[11px] text-pwc-ink-mute mt-2">
            기기에 저장된 모든 TBM 세션과 대화 기록이 영구 삭제됩니다. 복구할 수 없습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
