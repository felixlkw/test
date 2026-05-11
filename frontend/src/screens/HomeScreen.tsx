import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { putSession } from "../services/db";
import { createEmptySession } from "../services/sessionModel";
import type { SessionDomain } from "../services/sessionModel";
import { useDraftTbmList } from "../hooks/useSession";
import { cleanupExpiredSessions } from "../services/retention";
import CTAButton from "../components/CTAButton";
import PwcMark from "../components/PwcMark";
import RuleLine from "../components/RuleLine";
import { IconSettings, IconChevronRight, IconArrowRight } from "../components/Icon";
import { DomainBadge } from "../shared/ui/DomainBadge";
import { getDraftCountBadgeLabel } from "../shared/i18n/draftLabels";

// PR D Q8 — Settings 기본 도메인 키 (Settings와 동일 키).
const DEFAULT_DOMAIN_KEY = "safemate.ui.defaultDomain";

function readDefaultDomain(): SessionDomain | undefined {
  try {
    const v = localStorage.getItem(DEFAULT_DOMAIN_KEY);
    if (
      v === "manufacturing" ||
      v === "construction" ||
      v === "heavy_industry" ||
      v === "semiconductor"
    ) {
      return v;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const DOMAIN_OPTIONS: { value: SessionDomain; label: string; hint: string }[] = [
  { value: "manufacturing", label: "제조", hint: "가전·금속·조립·포장 라인" },
  { value: "construction", label: "건설", hint: "신축·리모델링·토목·플랜트" },
  { value: "heavy_industry", label: "중공업", hint: "조선·해양·철강·중장비" },
  { value: "semiconductor", label: "반도체", hint: "FAB·후공정·가스/화학" },
];

export default function HomeScreen() {
  const navigate = useNavigate();
  // PR-feedback-1 (v0.2.2) — 미완료 다건 인지. drafts[0]이 종전 useLatestDraft
  // 와 동일한 "가장 최근 미완료 1건"이며, drafts.length로 카운트 배지 가시성을
  // 판단한다. (listSessions는 updated_at desc 정렬 → drafts[0]이 최신)
  const { drafts, loading } = useDraftTbmList();
  const draft = drafts[0];
  const draftCount = drafts.length;
  const [showDomainSheet, setShowDomainSheet] = useState(false);

  // PR D Q8 — mount 시 1회 만료된 archived 세션 cleanup. retentionDays 미설정 시 no-op.
  // 비영속 view state 영향 0 (invariant #10) — IndexedDB 삭제만 발생.
  useEffect(() => {
    void cleanupExpiredSessions().catch((err) => {
      console.warn("[HomeScreen] retention cleanup failed:", err);
    });
  }, []);

  // 2026-05-07 felix HITL — VoiceShell ModeSwitcher가 EHS→TBM 전환 시 default
  // domain이 없으면 sessionStorage 플래그를 set한 뒤 navigate("/")로 보낸다.
  // HomeScreen mount 시 플래그 감지하면 도메인 sheet를 즉시 자동 open — 사용자가
  // "새 TBM 시작" 버튼을 따로 누르지 않아도 한 번에 흐름 진입. 1회용(consume).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("safemate.ui.openDomainSheetOnce") === "1") {
        sessionStorage.removeItem("safemate.ui.openDomainSheetOnce");
        setShowDomainSheet(true);
      }
    } catch {
      // sessionStorage 비활성 — fallback: 사용자가 직접 "새 TBM 시작" 클릭.
    }
  }, []);

  const startNewTbm = () => {
    // PR D Q8 — 기본 도메인이 설정돼 있으면 도메인 시트 우회 + 즉시 PrepareScreen.
    const defaultDomain = readDefaultDomain();
    if (defaultDomain) {
      void confirmDomain(defaultDomain);
      return;
    }
    setShowDomainSheet(true);
  };

  const confirmDomain = async (domain?: SessionDomain) => {
    setShowDomainSheet(false);
    const s = createEmptySession("TBM", "korean", undefined, { domain });
    await putSession(s);
    // PR A — c6 영역 I+VII: domain이 지정된 새 TBM은 PrepareScreen을 거친다.
    // domain 미지정(legacy "일반 TBM 시작")은 기존 RunScreen으로 직행 — invariant #9 보존.
    if (domain) {
      navigate(`/tbm/${s.session_id}/prepare`);
    } else {
      navigate(`/tbm/${s.session_id}`);
    }
  };

  const startNewEhs = async () => {
    // EHS Q&A 세션도 IndexedDB에 영속화 — 사진 첨부/분석을 위해 sessionId 필요
    // (handlePhotoCaptured가 sessionId 가드로 인해 undefined일 때 분석 skip).
    // History/Settings에서 EHS 세션도 동일하게 노출됨.
    const s = createEmptySession("EHS", "korean");
    await putSession(s);
    navigate(`/ehs/${s.session_id}`);
  };

  const resumeDraft = () => {
    if (!draft) return;
    // PR B (c6 §3.VII) — RunScreen rename. work_type_id 있으면(prepare 완료) `/run`로,
    // 없으면 legacy `/tbm/:id`로 — prepare 우회 흐름 또는 v0.2.0 세션 호환.
    if (draft.work_type_id) {
      navigate(`/tbm/${draft.session_id}/run`);
    } else {
      navigate(`/tbm/${draft.session_id}`);
    }
  };

  return (
    <div className="w-full min-h-screen bg-pwc-bg text-pwc-ink flex flex-col">
      {/* Brand bar */}
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <PwcMark size={22} />
          <span className="h-4 w-px bg-pwc-border" aria-hidden="true" />
          <span className="text-[13px] font-bold tracking-wide uppercase text-pwc-ink">
            SafeMate
          </span>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="w-9 h-9 flex items-center justify-center text-pwc-ink hover:text-pwc-orange"
          aria-label="설정"
        >
          <IconSettings size={20} />
        </button>
      </header>

      {/* Hero */}
      <section className="bg-pwc-hero px-6 pt-10 pb-12 relative overflow-hidden">
        <div className="max-w-xl">
          <h1 className="font-serif-display text-[34px] leading-[1.08] text-pwc-ink">
            현장의 안전을,<br />대화로 정리합니다
          </h1>
          <p className="mt-3 text-sm text-pwc-ink-soft max-w-sm">
            TBM 리더와 SafeMate가 음성으로 대화하며 체크리스트를 함께 작성합니다.
          </p>
        </div>
        <div className="absolute right-[-10px] bottom-4 opacity-95">
          <PwcMark size={30} variant="accent" />
        </div>
      </section>

      {/* Resume card */}
      {!loading && draft && (
        <section className="px-6 pt-6">
          <button
            onClick={resumeDraft}
            className="w-full text-left bg-white border border-pwc-border rounded-pwc-lg shadow-pwc-card p-4 flex items-center justify-between hover:border-pwc-orange transition"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                  진행 중
                </span>
                {/* PR B+ Q9 (OLD-M15 / NEW-M3) — Resume Card 도메인 배지.
                    invariant #9: domain undefined면 DomainBadge가 null 렌더. */}
                <DomainBadge domain={draft.domain} />
              </div>
              <div className="text-base font-semibold truncate mt-0.5">
                {draft.work_type || "TBM 세션"}
              </div>
              <div className="text-xs text-pwc-ink-mute mt-1">
                {new Date(draft.updated_at).toLocaleString("ko-KR")} · 이어서 하기
              </div>
            </div>
            <span className="text-pwc-orange shrink-0">
              <IconArrowRight size={22} />
            </span>
          </button>
          {/* PR-feedback-1 (v0.2.2) — 미완료 카운트 배지. N >= 2일 때만 표시.
              N === 1: 카드만 (v0.2.1 동작 유지). N === 0: 섹션 자체 미렌더. */}
          {draftCount >= 2 && (
            <button
              type="button"
              onClick={() => navigate("/history?filter=draft")}
              className="mt-2 w-full flex items-center justify-between text-left bg-pwc-orange-wash border border-pwc-orange/30 hover:border-pwc-orange rounded-pwc px-3 py-2 transition"
              aria-label={getDraftCountBadgeLabel("korean", draftCount)}
            >
              <span className="text-[12px] font-semibold text-pwc-orange">
                {getDraftCountBadgeLabel("korean", draftCount)}
              </span>
              <IconChevronRight size={14} className="text-pwc-orange" />
            </button>
          )}
        </section>
      )}

      {/* Quick actions */}
      <section className="px-6 pt-8 pb-4">
        <h2 className="text-[20px] font-bold">시작하기</h2>
        <RuleLine className="mt-2 mb-5" />

        <div className="flex flex-col gap-3">
          <CTAButton onClick={startNewTbm} block>
            새 TBM 시작
          </CTAButton>
          <CTAButton onClick={() => void startNewEhs()} variant="outline" block>
            EHS 안전 질문하기
          </CTAButton>
        </div>
      </section>

      <section className="px-6 pt-4 pb-10">
        <h2 className="text-[16px] font-bold">도구</h2>
        <RuleLine className="mt-2 mb-4" />
        <ul className="divide-y divide-pwc-border border-t border-pwc-border">
          <li>
            <button
              onClick={() => navigate("/history")}
              className="w-full flex items-center justify-between py-4 text-left hover:text-pwc-orange"
            >
              <div>
                <div className="text-sm font-semibold">과거 TBM 기록</div>
                <div className="text-xs text-pwc-ink-mute mt-0.5">이전 세션 열람 · 편집 · 삭제</div>
              </div>
              <IconChevronRight size={18} />
            </button>
          </li>
          <li>
            <button
              onClick={() => navigate("/settings")}
              className="w-full flex items-center justify-between py-4 text-left hover:text-pwc-orange"
            >
              <div>
                <div className="text-sm font-semibold">설정</div>
                <div className="text-xs text-pwc-ink-mute mt-0.5">앱 정보 · 데이터 관리</div>
              </div>
              <IconChevronRight size={18} />
            </button>
          </li>
        </ul>
      </section>

      <footer className="mt-auto px-6 pb-6 text-[11px] text-pwc-ink-mute">
        SafeMate · 산업안전 데모
      </footer>

      {showDomainSheet && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center"
          onClick={() => setShowDomainSheet(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-t-pwc-lg p-5 shadow-pwc-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="도메인 선택"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[17px] font-bold">산업 도메인 선택</h3>
              <button
                onClick={() => setShowDomainSheet(false)}
                className="text-pwc-ink-mute text-sm"
                aria-label="닫기"
              >
                닫기
              </button>
            </div>
            <p className="text-xs text-pwc-ink-mute mb-4">
              작업 현장의 특성에 맞는 안전 체크리스트와 허가서 흐름이 적용됩니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DOMAIN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => confirmDomain(opt.value)}
                  className="text-left rounded-pwc border border-pwc-border hover:border-pwc-orange p-4 transition"
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-pwc-ink-mute mt-1">{opt.hint}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => confirmDomain(undefined)}
              className="mt-4 w-full text-xs text-pwc-ink-soft py-2 hover:text-pwc-orange"
            >
              도메인 지정 없이 일반 TBM 시작 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
