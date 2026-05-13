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
  recommendHazardsQuick,
  type RecommendHazardsResponse,
  type WorkType,
} from "../services/recommendHazards";
import type {
  PreparedBaselineItem,
  PreparedConditionalItem,
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
import type { PrepareContextFormValue } from "../components/PrepareContextForm";
import { IconRefresh } from "../components/Icon";
import { getPrepareNonKoFallbackMicrocopy } from "../shared/i18n/cueMessages";
import { pickLabel } from "../services/catalogI18n";

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
  // 빈 객체로 시작; 모든 필드 옵셔널. 입력 시 debounced 1.5s 재추천 트리거.
  // PR-2 (v0.3.0) — 타입 `PreparedContext` → `PrepareContextFormValue`로 확장.
  // 추가 3 옵셔널 transient(workLocation/workContentDetails/equipmentDetails)는
  // contextPayload memo에서 제외되어 prepared_context로 영속되지 않고, startTbm
  // 시점에 prior_info 4 슬롯으로 hydration mirror.
  const [context, setContext] = useState<PrepareContextFormValue>({});

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

  // ── 2-bis. PR-2 form hydration ───────────────────────────
  // session 로드 직후 1회: PrepareContextForm value를 다음 우선순위로 hydrate.
  //   - PreparedContext 6 필드: session.prepared_context (영속본)
  //   - prior_info 3 슬롯(workLocation/workContentDetails/equipmentDetails):
  //     session.prior_info에서 form value로 빌려와서 사용자에게 다시 표시.
  //   - worker_count: prepared_context.worker_count 우선,
  //     없으면 prior_info.numberOfWorkers 폴백 (key mirror 역방향).
  //
  // 확신 못함: 기존 hydration 패턴 확인 후 통합 — PrepareScreen에는 setContext를
  // hydration에 쓰는 기존 useEffect가 없으므로 본 useEffect가 신규 분기. 향후
  // 다른 form state가 추가되어 hydration 통합 useEffect가 생기면 본 블록을
  // 그쪽으로 이관할 것.
  useEffect(() => {
    if (!session) return;
    setContext({
      // PreparedContext 6 필드 영속본 hydration
      ...(session.prepared_context ?? {}),
      // prior_info 3 슬롯 — form value로 빌려와서 사용자에게 다시 표시
      workLocation: session.prior_info?.workLocation,
      workContentDetails: session.prior_info?.workContentDetails,
      equipmentDetails: session.prior_info?.equipmentDetails,
      // worker_count ↔ prior_info.numberOfWorkers 동기화 — 우선순위:
      // prepared_context.worker_count(직접 영속) > prior_info.numberOfWorkers
      worker_count:
        session.prepared_context?.worker_count ??
        session.prior_info?.numberOfWorkers,
    });
    // session_id가 바뀌었을 때만 재실행(세션 단위 hydration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.session_id]);

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

  // ── 4. recommend-hazards 2단 응답 (v0.2.4 PR-feedback-2) ────────────
  // 1단(즉시): 작업유형 선택 → recommendHazardsQuick(정적 카탈로그) ≤300ms.
  //   네트워크 0회, source="catalog". work_type 미스 시 backend 폴백.
  // 2단(보강): PrepareContextForm 변경 1.5s debounce → recommendHazards()
  //   호출. 요청 body에 prior_baseline_ids/_conditional_ids 포함하여 backend
  //   Augmentation Mode 활성화. 응답을 1단 카드 위에 머지(id 보존).
  // "다시 받기": debounce 우회 + 5s cooldown.
  // cancellation: monotonically 증가하는 reqIdRef로 stale 응답 가드.
  const reqIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  // v0.2.5 PR-feedback-4 — cooldown setTimeout/interval ref 관리.
  // 컴포넌트 언마운트 시 정리해서 setState on unmounted 경고 회피.
  const cooldownTimerRef = useRef<number | null>(null);
  const cooldownIntervalRef = useRef<number | null>(null);
  // augmenting=true 일 때 카드 우상단 spinner. recommend는 그대로 노출(=
  // 1단 카드는 그대로 보이고 백그라운드에서 보강 중).
  const [augmenting, setAugmenting] = useState(false);
  // "다시 받기" cooldown — 남은 초(0 = 사용 가능, 5→4→3→2→1→0 카운트다운).
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const refreshCooldownActive = cooldownRemaining > 0;

  // PR A_v2-3: context payload — 도메인 토글 OFF면 무조건 undefined.
  // PreparedContext 빈 객체와 모든 필드 undefined인 객체 모두 → undefined.
  // PR-2 (v0.3.0): context state는 PrepareContextFormValue (= PreparedContext +
  // 3 transient 슬롯)로 확장됐으므로, prepared_context 영속에는 PreparedContext
  // 6 필드만 추출. 3 transient 슬롯(workLocation/workContentDetails/
  // equipmentDetails)은 startTbm에서 prior_info로 별도 hydration mirror.
  const contextPayload = useMemo<PreparedContext | undefined>(() => {
    if (!aiContextEnabled) return undefined;
    const has =
      context.worker_count !== undefined ||
      (context.shift !== undefined && context.shift !== "") ||
      context.wind_speed_mps !== undefined ||
      (context.new_material !== undefined && context.new_material !== "") ||
      (context.special_notes !== undefined && context.special_notes !== "") ||
      (context.previous_incident_keywords?.length ?? 0) > 0;
    if (!has) return undefined;
    // PreparedContext 6 필드만 추출 (prior_info 3 슬롯 제외).
    return {
      worker_count: context.worker_count,
      shift: context.shift,
      wind_speed_mps: context.wind_speed_mps,
      new_material: context.new_material,
      special_notes: context.special_notes,
      previous_incident_keywords: context.previous_incident_keywords,
    };
  }, [aiContextEnabled, context]);

  // 1단 — 정적 카탈로그 즉시 로드. work_type 미스 시 backend 호출로 폴백.
  // 카탈로그 로드는 Vite dynamic import()라 첫 호출은 chunk fetch가 필요할
  // 수도 있으나 압축 후 ~10 KB 이내로 ≤300ms 보장.
  const loadQuick = useCallback(async () => {
    if (!domain || !selectedWorkTypeId) {
      setRecommend(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setRecommendLoading(true);
    setRecommendError(null);
    try {
      const res = await recommendHazardsQuick({
        domain,
        workTypeId: selectedWorkTypeId,
        // v0.2.6 PR-5: 카탈로그 다국어 분기. language별 content_<lang> 우선,
        // 없으면 ko 폴백. 응답의 `content_only_ko_fallback`이 마이크로카피
        // 노출 가드(아래 nonKoFallbackMicrocopy 렌더 조건).
        language,
      });
      if (reqIdRef.current !== myId) return;
      setRecommend(res);
    } catch {
      // 카탈로그에 work_type_id가 없거나 동적 import 실패 — backend 폴백.
      // 사용자에게는 "불러오는 중..."만 노출(에러 메시지 X). 폴백 실패 시
      // 폴백 catch 블록이 recommendError를 세팅한다.
      try {
        const res = await recommendHazards({
          work_type_id: selectedWorkTypeId,
          domain,
          language,
          context: contextPayload,
        });
        if (reqIdRef.current !== myId) return;
        setRecommend(res);
      } catch (err: unknown) {
        if (reqIdRef.current !== myId) return;
        setRecommendError(err instanceof Error ? err.message : String(err));
        setRecommend(null);
      }
    } finally {
      if (reqIdRef.current === myId) setRecommendLoading(false);
    }
  }, [domain, selectedWorkTypeId, language, contextPayload]);

  // 머지 — 보강 응답 도착 시 호출. id 기반 dedup, 동일 baseline은 LLM 응답으로
  // 교체(per-item 갱신), 신규 baseline/conditional은 prepend/append.
  const mergeAugment = useCallback(
    (
      prev: RecommendHazardsResponse | null,
      next: RecommendHazardsResponse,
    ): RecommendHazardsResponse => {
      if (!prev) return next;
      const baselineMap = new Map<string, PreparedBaselineItem>();
      // 기존 카탈로그 baseline 먼저 — 응답 순서 보존
      for (const b of prev.baseline) baselineMap.set(b.id, b);
      // LLM 응답으로 교체(같은 id) + 신규 추가
      for (const b of next.baseline) baselineMap.set(b.id, b);
      const baseline = Array.from(baselineMap.values());

      const condMap = new Map<string, PreparedConditionalItem>();
      for (const c of prev.conditional) condMap.set(c.id, c);
      for (const c of next.conditional) condMap.set(c.id, c);
      const conditional = Array.from(condMap.values());

      return {
        baseline,
        conditional,
        // suggested_questions 는 LLM 보강 응답으로 교체(작업장 특이성 반영).
        suggested_questions:
          next.suggested_questions.length > 0
            ? next.suggested_questions
            : prev.suggested_questions,
        // incident_cases 도 LLM 응답으로 교체(카탈로그는 비어있는게 default).
        incident_cases:
          next.incident_cases.length > 0
            ? next.incident_cases
            : prev.incident_cases,
        scenarios: next.scenarios ?? prev.scenarios,
        mitigations: next.mitigations ?? prev.mitigations,
        ppe: next.ppe ?? prev.ppe,
        seed_revision: next.seed_revision ?? prev.seed_revision,
        generated_at: next.generated_at ?? prev.generated_at,
      };
    },
    [],
  );

  // 2단 — backend 보강 호출. 머지 모드: prev recommend가 있으면 prior_*ids
  // 를 보내 Augmentation Mode 활성화.
  const loadAugment = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!domain || !selectedWorkTypeId) return;
      const myId = ++reqIdRef.current;
      const prev = recommend;
      const priorBaselineIds = prev?.baseline.map((b) => b.id) ?? [];
      const priorConditionalIds = prev?.conditional.map((c) => c.id) ?? [];
      setAugmenting(true);
      setRecommendError(null);
      try {
        const res = await recommendHazards({
          work_type_id: selectedWorkTypeId,
          domain,
          language,
          context: contextPayload,
          refresh_seed: opts?.refresh ? Date.now() : undefined,
          // v0.2.4 PR-feedback-2: backend Augmentation Mode 활성화. prev가 없는
          // 첫 호출에는 빈 배열을 보내 backend는 일반 모드로 동작 — 후방 호환.
          prior_baseline_ids:
            priorBaselineIds.length > 0 ? priorBaselineIds : undefined,
          prior_conditional_ids:
            priorConditionalIds.length > 0 ? priorConditionalIds : undefined,
        });
        if (reqIdRef.current !== myId) return;
        setRecommend((cur) => mergeAugment(cur, res));
      } catch (err: unknown) {
        if (reqIdRef.current !== myId) return;
        // 보강 실패 시 1단 카드는 유지. 에러는 표기만 — 사용자가 다시 시도 가능.
        setRecommendError(err instanceof Error ? err.message : String(err));
      } finally {
        if (reqIdRef.current === myId) setAugmenting(false);
      }
    },
    [domain, selectedWorkTypeId, language, contextPayload, recommend, mergeAugment],
  );

  // 도메인/작업유형 변경 시: 1단 즉시 로드. 2단은 사용자 입력 또는 "다시 받기"
  // 트리거.
  useEffect(() => {
    if (!domain || !selectedWorkTypeId) return;
    void loadQuick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, selectedWorkTypeId]);

  // PrepareContextForm 변경 → 1.5s debounce → 2단 호출.
  // contextPayload undefined → form 비어있음 → 호출 X.
  // recommend null → 1단 미완 → 호출 X (중첩 가드).
  useEffect(() => {
    if (!domain || !selectedWorkTypeId) return;
    if (!contextPayload) return;
    if (!recommend) return;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void loadAugment();
    }, 1500);
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // recommend는 머지 후 새 객체가 되어 무한 루프 위험 — 명시 비포함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextPayload, domain, selectedWorkTypeId]);

  // "다시 받기" 핸들러 — 5s cooldown 적용 + 카운트다운 표기.
  // v0.2.5 PR-feedback-4 — 강제 보강 호출은 form debounce(1.5s)와 별도 경로라
  // cooldown 더 길게(5s) 두어 빠른 연속 클릭으로 인한 backend 부하 회피.
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 5000) return; // cooldown
    lastRefreshAtRef.current = now;
    // 이전 타이머/인터벌이 남아있다면 정리(연속 클릭 방지 + 안전).
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (cooldownIntervalRef.current !== null) {
      window.clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    // 5초 카운트다운: 5 → 4 → 3 → 2 → 1 → 0.
    setCooldownRemaining(5);
    cooldownIntervalRef.current = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    cooldownTimerRef.current = window.setTimeout(() => {
      setCooldownRemaining(0);
      if (cooldownIntervalRef.current !== null) {
        window.clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
      cooldownTimerRef.current = null;
    }, 5000);
    // debounce 우회 — 즉시 호출.
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void loadAugment({ refresh: true });
  }, [loadAugment]);

  // 언마운트 시 cooldown 타이머/인터벌 정리.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (cooldownIntervalRef.current !== null) {
        window.clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, []);

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
      // v0.2.6 PR-5: 다국어 분기 적용 — pickLabel(workType, language)로 현재
      // 세션 언어에 맞는 라벨을 저장(label_<lang> 우선, 없으면 ko 폴백).
      const selectedWorkType = workTypes.find((w) => w.id === selectedWorkTypeId);
      const selectedWorkTypeLabel = selectedWorkType
        ? pickLabel(selectedWorkType, language)
        : undefined;

      // PR-feedback-5 v0.2.9 → v0.3.0 — prior_info 4 슬롯 hydration mirror.
      // 우선순위(높음 → 낮음, 슬롯별):
      //   workLocation:        LLM > form
      //   workContentDetails:  LLM > form > work_type_label (PR-1 fallback)
      //   numberOfWorkers:     LLM > form.worker_count (key mirror; 0=falsy)
      //   equipmentDetails:    LLM > form
      // 규칙: prior_info에 이미 값이 있으면(LLM이 collect_prior_information으로
      // 채웠다면) form 값으로 덮어쓰지 않는다 — 사용자가 Prepare로 돌아와
      // form을 비웠다고 LLM update를 지우는 것은 의도와 다름. 신규 세션은
      // latest.prior_info === {} 이라 form 값으로 채워짐.
      // numberOfWorkers: 사용자 결정 — worker_count는 truthy 룰(0=미입력).
      const mergedPriorInfo = {
        ...latest.prior_info,
        ...(latest.prior_info.workLocation
          ? {}
          : context.workLocation
            ? { workLocation: context.workLocation }
            : {}),
        ...(latest.prior_info.workContentDetails
          ? {}
          : context.workContentDetails
            ? { workContentDetails: context.workContentDetails }
            : selectedWorkTypeLabel
              ? { workContentDetails: selectedWorkTypeLabel }
              : {}),
        ...(latest.prior_info.numberOfWorkers !== undefined
          ? {}
          : context.worker_count
            ? { numberOfWorkers: context.worker_count }
            : {}),
        ...(latest.prior_info.equipmentDetails
          ? {}
          : context.equipmentDetails
            ? { equipmentDetails: context.equipmentDetails }
            : {}),
      };

      await putSession({
        ...latest,
        work_type_id: selectedWorkTypeId,
        work_type_label: selectedWorkTypeLabel,
        prior_info: mergedPriorInfo,
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

  // v0.2.4 PR-feedback-2 — 비-한국어 사용자 카탈로그 ko-fallback 안내.
  // language="korean" 일 때는 빈 문자열 → 렌더링 가드로 미노출.
  const nonKoFallbackMicrocopy = useMemo(
    () => getPrepareNonKoFallbackMicrocopy(language),
    [language],
  );

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
            language={language}
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
              {/* PR-feedback-2 — "다시 받기"는 2단 보강 호출(debounce 우회).
                  v0.2.5 PR-feedback-4 — 5s cooldown + 카운트다운 표기.
                  1단 카드는 즉시 표시되어 있으므로 augmenting 표기만 보강
                  동안 노출. */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={augmenting || refreshCooldownActive || !recommend}
                className="inline-flex items-center gap-1 text-[12px] text-pwc-ink-soft hover:text-pwc-orange disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-pwc"
                aria-label={
                  refreshCooldownActive
                    ? `위험 추천 다시 받기 — ${cooldownRemaining}초 후 가능`
                    : "위험 추천 다시 받기"
                }
                aria-live="polite"
                title={
                  refreshCooldownActive
                    ? `${cooldownRemaining}초 후 다시 가능`
                    : "위험 추천을 다시 가져옵니다"
                }
              >
                <IconRefresh
                  size={14}
                  className={augmenting ? "animate-spin" : undefined}
                />
                <span>
                  {augmenting
                    ? "보강 중…"
                    : refreshCooldownActive
                      ? `${cooldownRemaining}초 후 가능`
                      : "다시 받기"}
                </span>
              </button>
            </div>
            <p className="text-xs text-pwc-ink-mute mt-1">
              필수 항목은 TBM 진행 중 자동으로 체크리스트에 포함됩니다.
            </p>
            <RuleLine className="mt-2 mb-3" />
            {/* PR-feedback-2 — 1단 카드는 정적 카탈로그라 ≤300ms 표시.
                recommendLoading은 카탈로그 chunk 로드 + (폴백 시) backend
                호출 시간만 노출. recommend가 들어오면 augmenting 동안에도
                카드는 그대로 노출하고 우상단 spinner로 보강 중임을 표시. */}
            {recommendLoading && !recommend && (
              <div className="text-sm text-pwc-ink-mute py-3" role="status">
                위험 추천 불러오는 중…
              </div>
            )}
            {recommendError && !recommend && (
              <div
                className="text-sm text-pwc-orange-deep border border-pwc-orange-deep/40 rounded-pwc px-3 py-2"
                role="alert"
              >
                위험 추천을 불러오지 못했습니다 — {recommendError}
              </div>
            )}
            {recommend && (
              <>
                {recommendError && augmenting === false && (
                  <div
                    className="text-[11px] text-pwc-orange-deep mb-2"
                    role="status"
                  >
                    AI 보강에 실패했습니다 — 카탈로그 카드는 그대로 사용 가능합니다.
                  </div>
                )}
                {/* v0.2.6 PR-5: ko-fallback 마이크로카피 노출 조건 강화.
                    기존 `language !== "korean"` → 카탈로그가 다국어로 채워진
                    경우에도 노출되던 false-positive 해소. 응답의
                    `content_only_ko_fallback === true` 인 경우에만 노출 —
                    즉 비-한국어 + 모든 항목이 ko 폴백일 때만. backend 보강
                    (`augmenting`) 진행 중에는 표기 회피. */}
                {recommend.content_only_ko_fallback === true && !augmenting && (
                  <p className="text-[11px] text-pwc-ink-mute mb-2 italic">
                    {nonKoFallbackMicrocopy}
                  </p>
                )}
                <HazardRecommendCard
                  baseline={recommend.baseline}
                  conditional={recommend.conditional}
                  language={language}
                  augmenting={augmenting}
                />
              </>
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
