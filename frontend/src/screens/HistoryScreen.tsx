import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { useSessionList, useArchivedSessionList } from "../hooks/useSession";
import { IconArchive, IconArrowRight, IconChevronRight } from "../components/Icon";
import { DomainBadge } from "../shared/ui/DomainBadge";
import { PermitChip } from "../shared/ui/PermitChip";
import type { Session, SessionDomain } from "../services/sessionModel";
import {
  formatRelativeTime,
  getHistoryContinueCtaLabel,
  getHistoryFilterAllLabel,
  getHistoryFilterCompletedLabel,
  getHistoryFilterDraftLabel,
  getHistoryShowMoreLabel,
} from "../shared/i18n/draftLabels";
import { domainLabel, isDomainVisible } from "../shared/tenant/config";

// Tenant-aware: 라벨과 가시성 모두 shared/tenant/config.ts에서 결정.
// hiddenDomains에 포함된 도메인은 filter chip 자체가 노출되지 않음.
const DOMAIN_FILTER_ORDER: SessionDomain[] = [
  "manufacturing",
  "construction",
  "heavy_industry",
  "semiconductor",
];
const DOMAIN_FILTERS: { value: SessionDomain | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  ...DOMAIN_FILTER_ORDER.filter(isDomainVisible).map((value) => ({
    value,
    label: domainLabel(value),
  })),
];

// PR-feedback-1 (v0.2.2) — 상태 세그먼트 컨트롤(전체/미완료/완료).
type StatusFilter = "all" | "draft" | "completed";

// PR-feedback-1 — 페이지네이션 상한. 첫 페이지 10건, "더보기" 클릭 시 +10.
const PAGE_SIZE = 10;
// Stale draft 디밍 임계 — 14일.
const STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;

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

  // PR-feedback-1 (v0.2.2) — 상태 세그먼트(전체/미완료/완료).
  // 홈에서 "이어쓸 TBM N건" 배지를 통해 진입한 경우 ?filter=draft 가 붙어 오므로
  // 초기 상태를 그에 맞춘다. URL은 1회만 읽고 이후 사용자 조작은 컴포넌트 state.
  const [searchParams] = useSearchParams();
  const initialStatusFilter: StatusFilter =
    searchParams.get("filter") === "draft"
      ? "draft"
      : searchParams.get("filter") === "completed"
        ? "completed"
        : "all";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);

  // PR-feedback-1 — 페이지네이션. 필터 변경 시 1페이지로 리셋.
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    setPageCount(1);
  }, [query, domainFilter, statusFilter, includeArchived]);

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
      // PR-feedback-1 — 상태 세그먼트 필터.
      //   draft 탭: status==="draft" + EHS 제외(transient Q&A 세션은 "이어쓰기"
      //   대상이 아님 — 홈 Resume Card 정책과 일치). all/completed 탭은 EHS 포함.
      if (statusFilter === "draft") {
        if (s.status !== "draft") return false;
        if ((s.mode ?? "TBM") === "EHS") return false;
      } else if (statusFilter === "completed") {
        if (s.status !== "confirmed") return false;
      }
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
  }, [merged, query, domainFilter, statusFilter]);

  // PR-feedback-1 — 페이지네이션 적용.
  const visibleLimit = pageCount * PAGE_SIZE;
  const visible = filtered.slice(0, visibleLimit);
  const hasMore = filtered.length > visibleLimit;

  // 상태 세그먼트 라벨(한국어 기본). 홈 i18n과 일관.
  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: getHistoryFilterAllLabel("korean") },
    { value: "draft", label: getHistoryFilterDraftLabel("korean") },
    { value: "completed", label: getHistoryFilterCompletedLabel("korean") },
  ];

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

        {/* PR-feedback-1 (v0.2.2) — 상태 세그먼트 컨트롤. 홈 카운트 배지 →
            ?filter=draft 진입 지점. EHS 미완료 세션은 "미완료" 탭에서 제외. */}
        <div className="mb-3 inline-flex rounded-pwc border border-pwc-border bg-white p-0.5">
          {STATUS_FILTERS.map((f) => {
            const selected = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={[
                  "text-[12px] px-3 py-1.5 rounded-[calc(var(--pwc-r)-2px)] font-semibold transition",
                  selected
                    ? "bg-pwc-orange text-white"
                    : "text-pwc-ink-soft hover:text-pwc-orange",
                ].join(" ")}
                aria-pressed={selected}
              >
                {f.label}
              </button>
            );
          })}
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
          <>
            <ul className="divide-y divide-pwc-border border-t border-pwc-border">
              {visible.map((s) => {
                const isConfirmed = s.status === "confirmed";
                const isDraft = s.status === "draft";
                const permitCount = s.permits?.length ?? 0;
                const isArchived = !!s.archived_at;
                // PR-feedback-1 — 미완료 탭 stale draft 디밍. 14일 이상된
                // draft만 opacity 0.6. 자동 archive는 하지 않음.
                const isStaleDraft =
                  statusFilter === "draft" &&
                  isDraft &&
                  Date.now() - new Date(s.created_at).getTime() > STALE_DRAFT_MS;
                // 진행률(체크리스트 완료 비율) — 항목이 1개 이상이면 표시.
                const checklist = s.checklist_items ?? [];
                const completed = checklist.filter((c) => c.completed).length;
                const progressPct =
                  checklist.length > 0
                    ? Math.round((completed / checklist.length) * 100)
                    : null;
                // 작업명: work_type_label > work_type > "제목 없음".
                const workTitle =
                  s.work_type_label || s.work_type || "제목 없음";
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
                        : isStaleDraft
                          ? "opacity-60 hover:bg-pwc-orange-wash"
                          : "hover:bg-pwc-orange-wash",
                    ].join(" ")}
                  >
                    <div className="w-24 shrink-0 pl-1">
                      <div className="text-sm font-bold">{formatDate(s.updated_at)}</div>
                      <div className="text-[11px] text-pwc-ink-mute">
                        {formatTime(s.updated_at)}
                      </div>
                      {/* PR-feedback-1 — relative time(예: "3분 전")을 부가
                          정보로 추가. 절대 날짜는 위에서 그대로 표시. */}
                      <div className="text-[10px] text-pwc-ink-mute mt-0.5">
                        {formatRelativeTime(s.updated_at, "korean")}
                      </div>
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
                        {isStaleDraft && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider text-pwc-ink-mute bg-pwc-bg-card"
                            title="14일 이상 미완료"
                          >
                            오래됨
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold truncate">{workTitle}</div>
                      <div className="text-[11px] text-pwc-ink-mute mt-0.5">
                        메시지 {s.messages.length}개 · 체크리스트{" "}
                        {checklist.length}개
                        {progressPct !== null && ` · ${progressPct}%`}
                      </div>
                    </div>
                    {/* PR-feedback-1 — 미완료 탭에서는 "이어쓰기" CTA를 명시.
                        다른 탭은 종래 chevron만. */}
                    {statusFilter === "draft" && isDraft ? (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-pwc-orange uppercase tracking-wider"
                        aria-label={getHistoryContinueCtaLabel("korean")}
                      >
                        {getHistoryContinueCtaLabel("korean")}
                        <IconArrowRight size={14} />
                      </span>
                    ) : (
                      <IconChevronRight
                        size={16}
                        className="text-pwc-ink-mute shrink-0"
                      />
                    )}
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
            {/* PR-feedback-1 — 페이지네이션 "더보기" 버튼. 다음 10건 추가. */}
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPageCount((n) => n + 1)}
                  className="text-[12px] px-4 py-2 rounded-pwc border border-pwc-border-strong bg-white text-pwc-ink-soft font-semibold hover:border-pwc-orange hover:text-pwc-orange transition"
                >
                  {getHistoryShowMoreLabel("korean")} ({filtered.length - visibleLimit})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
