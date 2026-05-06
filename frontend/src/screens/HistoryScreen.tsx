import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { useSessionList, useArchivedSessionList } from "../hooks/useSession";
import { IconArchive, IconChevronRight } from "../components/Icon";
import { DomainBadge } from "../shared/ui/DomainBadge";
import { PermitChip } from "../shared/ui/PermitChip";
import type { Session, SessionDomain } from "../services/sessionModel";

const DOMAIN_FILTERS: { value: SessionDomain | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "manufacturing", label: "제조" },
  { value: "construction", label: "건설" },
  { value: "heavy_industry", label: "중공업" },
  { value: "semiconductor", label: "반도체" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const { sessions: activeSessions, loading: activeLoading, archive } = useSessionList();
  const { sessions: archivedSessions, loading: archivedLoading } = useArchivedSessionList();

  // PR D Q13 — 검색·필터 view state. invariant #10 — 비영속.
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<SessionDomain | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("이 세션을 보관함으로 이동할까요? 영구 삭제는 설정에서 가능합니다.")) return;
    await archive(id);
  };

  const loading = activeLoading || (includeArchived && archivedLoading);

  // 합치되 중복 회피 — archived는 active와 별개.
  const merged: Session[] = useMemo(() => {
    if (!includeArchived) return activeSessions;
    // archived_at desc 추가 — listSessions는 updated_at desc 기준이라 archived는 별개로 처리됨.
    return [...activeSessions, ...archivedSessions];
  }, [activeSessions, archivedSessions, includeArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((s) => {
      // 도메인 필터
      if (domainFilter !== "all") {
        if (s.domain !== domainFilter) return false;
      }
      // 검색
      if (q.length === 0) return true;
      const workType = (s.work_type || "").toLowerCase();
      const workTypeLabel = (s.work_type_label || "").toLowerCase();
      const firstMessage = (s.messages?.[0]?.text || "").toLowerCase();
      const finalSummary = (s.final_summary || "").toLowerCase();
      return (
        workType.includes(q) ||
        workTypeLabel.includes(q) ||
        firstMessage.includes(q) ||
        finalSummary.includes(q)
      );
    });
  }, [merged, query, domainFilter]);

  return (
    <div className="w-full min-h-screen bg-pwc-bg text-pwc-ink flex flex-col">
      <TopBar title="과거 TBM 기록" backTo="/" />

      <div className="flex-1 px-5 py-4">
        {/* PR D Q13 — 검색 input. */}
        <div className="mb-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작업명·요약·첫 메시지 검색"
            aria-label="세션 검색"
            className="w-full px-3 py-2 rounded-pwc border border-pwc-border-strong text-sm focus:outline-none focus:border-pwc-orange"
          />
        </div>

        {/* PR D Q13 — 도메인 chip + archived 토글. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {DOMAIN_FILTERS.map((f) => {
            const selected = domainFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setDomainFilter(f.value)}
                className={[
                  "text-[11px] px-2.5 py-1 rounded-pwc border font-semibold transition",
                  selected
                    ? "bg-pwc-orange text-white border-pwc-orange"
                    : "bg-white text-pwc-ink-soft border-pwc-border hover:border-pwc-orange hover:text-pwc-orange",
                ].join(" ")}
                aria-pressed={selected}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-auto" />
          <button
            type="button"
            onClick={() => setIncludeArchived((v) => !v)}
            className={[
              "text-[11px] px-2.5 py-1 rounded-pwc border font-semibold transition",
              includeArchived
                ? "bg-pwc-bg-card text-pwc-ink border-pwc-border-strong"
                : "bg-white text-pwc-ink-soft border-pwc-border hover:border-pwc-orange hover:text-pwc-orange",
            ].join(" ")}
            aria-pressed={includeArchived}
          >
            {includeArchived ? "✓ 보관 포함" : "보관 포함"}
          </button>
        </div>

        {loading && <div className="text-pwc-ink-mute text-sm">불러오는 중...</div>}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-pwc-ink-mute text-sm mt-16">
            {merged.length === 0 ? "저장된 세션이 없습니다." : "결과가 없습니다."}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="divide-y divide-pwc-border border-t border-pwc-border">
            {filtered.map((s) => {
              const isConfirmed = s.status === "confirmed";
              const permitCount = s.permits?.length ?? 0;
              const isArchived = !!s.archived_at;
              return (
                <li
                  key={s.session_id}
                  // PR B (c6 §3.VII) — RunScreen rename. work_type_id 있으면 신규 `/run`,
                  // 없으면 legacy `/tbm/:id`로 — v0.2.0 이전 세션·prepare 우회 호환.
                  // EHS 세션 영속화(Phase 2.x EHS-photo 패치)로 EHS도 History에
                  // 노출되므로 mode==="EHS"이면 `/ehs/:id`로 분기 — URL/모드 일관성.
                  onClick={() =>
                    navigate(
                      s.mode === "EHS"
                        ? `/ehs/${s.session_id}`
                        : s.work_type_id
                          ? `/tbm/${s.session_id}/run`
                          : `/tbm/${s.session_id}`,
                    )
                  }
                  className={[
                    "w-full flex items-center gap-3 py-4 text-left transition cursor-pointer",
                    isArchived
                      ? "opacity-60 hover:bg-pwc-bg-card"
                      : "hover:bg-pwc-orange-wash",
                  ].join(" ")}
                >
                  <div className="w-24 shrink-0 pl-1">
                    <div className="text-sm font-bold">{formatDate(s.updated_at)}</div>
                    <div className="text-[11px] text-pwc-ink-mute">{formatTime(s.updated_at)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                          isConfirmed
                            ? "text-pwc-ink bg-pwc-bg-card"
                            : "text-pwc-orange bg-pwc-orange-wash"
                        }`}
                      >
                        {isConfirmed ? "확정" : "초안"}
                      </span>
                      <span className="text-[10px] text-pwc-ink-mute uppercase tracking-wider">
                        {s.mode}
                      </span>
                      <DomainBadge domain={s.domain} />
                      <PermitChip count={permitCount} />
                      {isArchived && (
                        <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider text-pwc-ink-soft bg-pwc-bg-card">
                          보관
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold truncate">
                      {s.work_type_label || s.work_type || "제목 없음"}
                    </div>
                    <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                      메시지 {s.messages.length}개 · 체크리스트 {s.checklist_items.length}개
                    </div>
                  </div>
                  <IconChevronRight size={16} className="text-pwc-ink-mute shrink-0" />
                  {!isArchived && (
                    <button
                      onClick={(e) => handleArchive(s.session_id, e)}
                      className="shrink-0 w-9 h-9 flex items-center justify-center text-pwc-ink-mute hover:text-pwc-orange"
                      aria-label="보관"
                      title="보관함으로 이동"
                    >
                      <IconArchive size={18} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
