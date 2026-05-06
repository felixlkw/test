// PrepareScreen — PR A (Phase 2.0 MVP, c6 영역 I + VII 진입).
// 작업 선택 → AI 위험 추천 → 리더 검토 → "TBM 시작"으로 RunScreen(`/tbm/:id/run`이 아닌
// 현재는 `/tbm/:id`)로 이동. PR B에서 RunScreen rename 예정.
//
// 패러다임: progressive form (c6 결정 1=B, 결정 2=A — stepper+chat 병행 화해안의
// 'form'면). chat-first는 RunScreen에서.
//
// invariants:
//   #1: useSessionPersistence를 호출하지 않음. PrepareScreen은 가벼운 form이라
//       race를 회피하기 위해 직접 putSession + getSession만 사용. RunScreen 진입
//       시 useSessionPersistence가 hydration으로 work_type_id를 읽어들임.
//   #4: getSession은 normalizeSession 통과(db.ts 내부 보장).
//   #6: DB_VERSION=2 유지 — 새 store 없음. 옵셔널 필드 추가만.
//   #7: 모든 신규 필드 옵셔널.
//   #9: domain undefined 시 HomeScreen으로 redirect (PrepareScreen은 domain 필수).
//   #10: 화면 토글(loading 등) 비영속.
//
// PR A 보강 (felix HITL):
//   1. "다시 받기" 버튼: recommendHazards fetch를 loadRecommend()로 추출 + 수동 호출.
//   2. baseline → checklist_items prefill: TBM 시작 시 createBaselineChecklistItems
//      로 변환해 Session.checklist_items에 prepend (기존 dynamic 항목 보존, race-safe).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSession, putSession } from "../services/db";
import {
  fetchWorkTypes,
  recommendHazards,
  type RecommendHazardsResponse,
  type WorkType,
} from "../services/recommendHazards";
import type {
  PreparedContext,
  Session,
  SessionLanguage,
} from "../services/sessionModel";
import { createBaselineChecklistItems } from "../services/checklist";
import { isAiContextEnabled } from "../services/aiSettings";
import TopBar from "../components/TopBar";
import RuleLine from "../components/RuleLine";
import CTAButton from "../components/CTAButton";
import WorkTypeCatalog from "../components/WorkTypeCatalog";
import HazardRecommendCard from "../components/HazardRecommendCard";
import SuggestedQuestionChips from "../components/SuggestedQuestionChips";
import PrepareContextForm from "../components/PrepareContextForm";
import { IconRefresh } from "../components/Icon";

// 자동 재추천은 도메인/작업유형 변경 시에만 트리거. 컨텍스트 폼 변경은
// 자동 fetch에서 분리(2026-05-04) — felix lock c8 §12-#8(5/60s rate limit)이
// 폼 키스트로크마다 호출되며 정상 사용자가 자기 자신을 차단하던 모순 해소.
// 컨텍스트 반영은 사용자가 "다시 받기"를 누를 때만(refresh_seed nonce 부여).

type PrepareLoadState = "loading" | "ready" | "error";

export default function PrepareScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loadState, setLoadState] = useState<PrepareLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  // 작업유형 목록
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [workTypesLoading, setWorkTypesLoading] = useState(false);
  const [workTypesError, setWorkTypesError] = useState<string | null>(null);

  // 선택된 작업유형 (PR A에선 단일 선택)
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState<string | undefined>(
    undefined,
  );

  // 추천 위험 결과
  const [recommend, setRecommend] = useState<RecommendHazardsResponse | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  // PR A_v2-3 — 컨텍스트 입력 (felix lock c8 §5).
  // 빈 객체로 시작; 모든 필드 옵셔널. 입력 시 debounced 500ms 재추천 트리거.
  const [context, setContext] = useState<PreparedContext>({});

  // 저장 동작
  const [saving, setSaving] = useState(false);

  // ── 1. Session hydrate ───────────────────────────────────
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
        setSelectedWorkTypeId(s.work_type_id);
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

  // ── 2. domain guard (invariant #9) ───────────────────────
  // domain 미지정 세션은 PrepareScreen 무의미 → HomeScreen으로 redirect.
  useEffect(() => {
    if (loadState === "ready" && session && !session.domain) {
      navigate("/", { replace: true });
    }
  }, [loadState, session, navigate]);

  const domain = session?.domain;
  const language: SessionLanguage = session?.language ?? "korean";
  // PR A_v2-3: per-domain "AI 컨텍스트 활용" 토글. 반도체 기본 OFF.
  // OFF면 form은 disabled + recommendHazards 호출에 context 미포함.
  const aiContextEnabled = useMemo(() => isAiContextEnabled(domain), [domain]);

  // ── 3. work-types fetch ──────────────────────────────────
  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    setWorkTypesLoading(true);
    setWorkTypesError(null);
    fetchWorkTypes(domain)
      .then((items) => {
        if (cancelled) return;
        setWorkTypes(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setWorkTypesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setWorkTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  // ── 4. recommend-hazards (loadRecommend로 추출 — 수동 새로고침용) ────
  // PR A_v2-2: backend가 GPT-4o로 전환됨 → 동일 입력에서도 "다시 받기" 시
  // refresh_seed=Date.now()를 보내 다양성을 유도. 5회/60s rate-limit 초과 시
  // backend 429 → recommendError에 메시지 표출 (UI는 A_v2-3에서 친화적으로 교체).
  // cancellation: monotonically 증가하는 reqIdRef로 stale 응답 가드.
  const reqIdRef = useRef(0);

  // PR A_v2-3: context payload — 도메인 토글 OFF면 무조건 undefined.
  // PreparedContext 빈 객체와 모든 필드 undefined인 객체 모두 → undefined.
  const contextPayload = useMemo<PreparedContext | undefined>(() => {
    if (!aiContextEnabled) return undefined;
    const has =
      context.worker_count !== undefined ||
      (context.shift !== undefined && context.shift !== "") ||
      context.wind_speed_mps !== undefined ||
      (context.new_material !== undefined && context.new_material !== "") ||
      (context.special_notes !== undefined && context.special_notes !== "") ||
      (context.previous_incident_keywords?.length ?? 0) > 0;
    return has ? context : undefined;
  }, [aiContextEnabled, context]);

  const loadRecommend = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!domain || !selectedWorkTypeId) {
        setRecommend(null);
        return;
      }
      const myId = ++reqIdRef.current;
      setRecommendLoading(true);
      setRecommendError(null);
      try {
        const res = await recommendHazards({
          work_type_id: selectedWorkTypeId,
          domain,
          language,
          // PR A_v2-3: 도메인 토글 OFF 또는 빈 form이면 미전송.
          context: contextPayload,
          // 수동 "다시 받기" 클릭에만 nonce 부여. 자동 fetch는 미부여.
          refresh_seed: opts?.refresh ? Date.now() : undefined,
        });
        if (reqIdRef.current !== myId) return; // 더 새로운 요청이 진입함 → drop
        setRecommend(res);
      } catch (err: unknown) {
        if (reqIdRef.current !== myId) return;
        setRecommendError(err instanceof Error ? err.message : String(err));
        setRecommend(null);
      } finally {
        if (reqIdRef.current === myId) setRecommendLoading(false);
      }
    },
    [domain, selectedWorkTypeId, language, contextPayload],
  );

  // 도메인/작업유형 변경 시에만 자동 호출. 컨텍스트(form) 변경은 자동 fetch X —
  // 사용자가 "다시 받기"를 눌러야 반영된다. loadRecommend는 closure로 최신
  // contextPayload를 가지므로 명시 호출 시 정상 동작.
  useEffect(() => {
    if (!domain || !selectedWorkTypeId) return;
    void loadRecommend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, selectedWorkTypeId]);

  // ── 5. preparedHazards memo ─────────────────────────────
  const preparedHazards = useMemo<string[]>(() => {
    if (!recommend) return [];
    return recommend.baseline.map((b) => b.content).filter(Boolean);
  }, [recommend]);

  // ── 6. start TBM handler ─────────────────────────────────
  const startTbm = async () => {
    if (!session || !selectedWorkTypeId) return;
    setSaving(true);
    try {
      // 최신 세션을 다시 읽어서 race 회피(VoiceShell의 useSessionPersistence가
      // 다른 화면에서 동시에 쓰는 일은 없지만 방어적).
      const latest = (await getSession(session.session_id)) ?? session;

      // PR A 보강 — baseline을 RunScreen 진입 즉시 ChecklistPanel에 표시.
      // 기존 dynamic 항목(is_baseline 미설정)은 보존, baseline만 prepend.
      // 일반 신규 세션은 latest.checklist_items가 빈 배열이라 baseline만 들어감.
      const baselineItems = createBaselineChecklistItems(recommend?.baseline ?? []);
      const existingDynamic = (latest.checklist_items ?? []).filter(
        (it) => !it.is_baseline,
      );
      const merged = [
        ...baselineItems,
        ...existingDynamic.map((it, i) => ({
          ...it,
          index: baselineItems.length + i + 1,
        })),
      ];

      // PR B+ NEW-H5: 영문 ID 외에 사용자 친화 라벨도 같이 저장.
      // 현재 카탈로그가 한국어 우선이라 label_ko 사용. 다국어 전환 시 i18n.
      const selectedWorkType = workTypes.find((w) => w.id === selectedWorkTypeId);
      const selectedWorkTypeLabel = selectedWorkType?.label_ko;

      await putSession({
        ...latest,
        work_type_id: selectedWorkTypeId,
        work_type_label: selectedWorkTypeLabel,
        // Backward-compat derive (PR A): prepared_hazards = baseline.content[].
        // Will be deprecated in a later cycle (felix decision §12-#9).
        prepared_hazards: preparedHazards,
        // PR A_v2-2: rich prepare-stage fields. All optional and PrepareScreen-owned.
        prepared_baseline: recommend?.baseline,
        prepared_conditional: recommend?.conditional,
        prepared_questions: recommend?.suggested_questions,
        prepared_incident_cases: recommend?.incident_cases,
        // PR F — Push paradigm: prepare가 risk scenarios/mitigations/ppe까지 함께
        // 가져오면 RunScreen 진입 즉시 VoiceShell prefill useEffect가 structured
        // 8필드를 채운다. backend가 미반환(legacy)이거나 빈 배열이면 prefill skip.
        prepared_scenarios: recommend?.scenarios,
        prepared_mitigations: recommend?.mitigations,
        prepared_ppe: recommend?.ppe,
        // PR A_v2-3: 컨텍스트 저장 — aiContextEnabled OFF면 undefined.
        prepared_context: contextPayload,
        prepared_at: recommend?.generated_at ?? new Date().toISOString(),
        prepared_seed_revision: recommend?.seed_revision,
        checklist_items: merged,
      });
      // PR B (c6 §3.VII) — RunScreen rename. PrepareScreen 완료 후 신규 `/run` 라우트로.
      // legacy `/tbm/:id`는 호환을 위해 라우터에 유지(외부 링크·북마크·뒤로가기).
      navigate(`/tbm/${session.session_id}/run`);
    } catch (err) {
      setSaving(false);
      // alert is intentional — 데모 환경, dev 검증용. PR D에서 토스트로 교체 예정.
      window.alert(
        `세션을 저장하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const domainLabel = useMemo<string>(() => {
    switch (domain) {
      case "manufacturing":
        return "제조";
      case "construction":
        return "건설";
      case "heavy_industry":
        return "중공업";
      case "semiconductor":
        return "반도체";
      default:
        return "—";
    }
  }, [domain]);

  // ── render ───────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-pwc-bg text-pwc-ink">
        <TopBar title="준비" backTo="/" />
        <div className="px-5 py-10 text-sm text-pwc-ink-mute" role="status">
          세션을 불러오는 중…
        </div>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-pwc-bg text-pwc-ink">
        <TopBar title="준비" backTo="/" />
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

  return (
    <div className="min-h-screen bg-pwc-bg text-pwc-ink">
      <TopBar title="준비" backTo="/" />

      <main className="px-5 py-5 space-y-7 max-w-2xl mx-auto">
        {/* domain badge */}
        <section aria-labelledby="prep-domain">
          <h2
            id="prep-domain"
            className="text-[13px] uppercase tracking-wider font-bold text-pwc-orange"
          >
            도메인
          </h2>
          <RuleLine className="mt-1 mb-2" />
          <p className="text-base font-semibold">{domainLabel}</p>
        </section>

        {/* work type catalog */}
        <section aria-labelledby="prep-worktype">
          <h2 id="prep-worktype" className="font-serif-display text-[20px] text-pwc-ink">
            작업 선택
          </h2>
          <p className="text-xs text-pwc-ink-mute mt-1">
            오늘 진행하는 작업을 하나 고르세요. 선택하면 AI가 필수 점검 항목과
            조건부 점검을 제안합니다.
          </p>
          <RuleLine className="mt-2 mb-3" />
          <WorkTypeCatalog
            workTypes={workTypes}
            selectedId={selectedWorkTypeId}
            onSelect={setSelectedWorkTypeId}
            loading={workTypesLoading}
            error={workTypesError}
          />
        </section>

        {/* PR A_v2-3 — 컨텍스트 입력 (옵셔널). 작업 선택 후 노출.
            PR B+ NEW-H1: 폼 펼침 default + onboarding hint. */}
        {selectedWorkTypeId && (
          <section aria-labelledby="prep-context">
            <h2 id="prep-context" className="sr-only">
              현장 컨텍스트
            </h2>
            {aiContextEnabled && (
              <p className="text-[11px] text-pwc-ink-soft mb-2 leading-relaxed">
                현장 상황을 입력하면 AI가 더 정확한 위험을 제안합니다 (선택).
              </p>
            )}
            <PrepareContextForm
              value={context}
              onChange={setContext}
              disabled={!aiContextEnabled}
              domain={domain}
              language={language}
            />
            {!aiContextEnabled && (
              <p className="text-[11px] text-pwc-ink-mute mt-2">
                반도체 도메인은 영업비밀 보호를 위해 컨텍스트 활용이 기본
                비활성화되어 있습니다. Settings → "AI 컨텍스트 활용"에서
                활성화하면 입력 가능합니다.
              </p>
            )}
          </section>
        )}

        {/* hazard recommendation */}
        {selectedWorkTypeId && (
          <section aria-labelledby="prep-hazards">
            <div className="flex items-center justify-between gap-2">
              <h2 id="prep-hazards" className="font-serif-display text-[20px] text-pwc-ink">
                위험 추천
              </h2>
              {/* PR A 보강 — 다시 받기 버튼. recommendLoading 동안 disabled. */}
              <button
                type="button"
                onClick={() => void loadRecommend({ refresh: true })}
                disabled={recommendLoading}
                className="inline-flex items-center gap-1 text-[12px] text-pwc-ink-soft hover:text-pwc-orange disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-pwc"
                aria-label="위험 추천 다시 받기"
                title="위험 추천을 다시 가져옵니다"
              >
                <IconRefresh
                  size={14}
                  className={recommendLoading ? "animate-spin" : undefined}
                />
                <span>{recommendLoading ? "불러오는 중…" : "다시 받기"}</span>
              </button>
            </div>
            <p className="text-xs text-pwc-ink-mute mt-1">
              필수 항목은 TBM 진행 중 자동으로 체크리스트에 포함됩니다.
            </p>
            <RuleLine className="mt-2 mb-3" />
            {recommendLoading && (
              <div className="text-sm text-pwc-ink-mute py-3" role="status">
                위험 추천 불러오는 중…
              </div>
            )}
            {recommendError && (
              <div
                className="text-sm text-pwc-orange-deep border border-pwc-orange-deep/40 rounded-pwc px-3 py-2"
                role="alert"
              >
                위험 추천을 불러오지 못했습니다 — {recommendError}
              </div>
            )}
            {!recommendLoading && !recommendError && recommend && (
              <HazardRecommendCard
                baseline={recommend.baseline}
                conditional={recommend.conditional}
                language={language}
              />
            )}
          </section>
        )}

        {/* suggested questions */}
        {recommend && recommend.suggested_questions.length > 0 && (
          <section aria-labelledby="prep-questions">
            <h2 id="prep-questions" className="font-serif-display text-[20px] text-pwc-ink">
              추천 질문
            </h2>
            <p className="text-xs text-pwc-ink-mute mt-1">
              TBM 진행 중 작업자에게 확인할 만한 질문 예시입니다.
            </p>
            <RuleLine className="mt-2 mb-3" />
            <SuggestedQuestionChips questions={recommend.suggested_questions} />
          </section>
        )}

        {/* CTA */}
        <section className="pt-2 pb-10">
          <CTAButton
            block
            disabled={!selectedWorkTypeId || saving || recommendLoading}
            onClick={() => void startTbm()}
          >
            {saving ? "저장 중…" : "TBM 시작"}
          </CTAButton>
          {!selectedWorkTypeId && (
            <p className="text-[11px] text-pwc-ink-mute mt-2">
              작업유형을 선택하면 TBM을 시작할 수 있습니다.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
