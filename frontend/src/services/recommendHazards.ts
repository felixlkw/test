// recommendHazards — PR A (c7 #1) / PR A_v2-1+2 LLM-driven prepare client.
// Endpoint contract:
//   GET  /api/work-types?domain=...        → WorkType[]
//   POST /api/recommend-hazards { work_type_id, domain, language, context?, refresh_seed? }
//     → { baseline, conditional, suggested_questions, incident_cases,
//         seed_revision?, generated_at? }
// PR A_v2-1: backend now calls GPT-4o (JSON mode) and falls back to the static
// catalog on failure — frontend contract is otherwise unchanged. PR A_v2-2
// extends the request body with optional `context` + `refresh_seed` and the
// response with optional `seed_revision` + `generated_at`. baseline / conditional
// items now carry a `source` ("catalog" | "llm") label.

import type {
  PreparedBaselineItem,
  PreparedConditionalItem,
  PreparedContext,
  PreparedIncidentCase,
  PreparedScenarioItem,
  PreparedMitigationItem,
  PreparedPpeItem,
  SessionDomain,
  SessionLanguage,
} from "./sessionModel";

export interface WorkType {
  id: string;
  label_ko: string;
  label_en: string;
  domain: SessionDomain;
}

// Re-exports kept for backward compatibility with PR A consumers
// (HazardRecommendCard, ChecklistPanel, etc.).
export type BaselineHazardItem = PreparedBaselineItem;
export type ConditionalHazardItem = PreparedConditionalItem;
export type IncidentCaseItem = PreparedIncidentCase;

export interface RecommendHazardsRequestBody {
  work_type_id: string;
  domain: SessionDomain;
  language: SessionLanguage;
  /** PR A_v2-2: optional user-provided context. The backend forwards this to
   *  the LLM prompt so the recommendation reflects today's site conditions. */
  context?: PreparedContext;
  /** PR A_v2-2: nonce — pass `Date.now()` on "다시 받기" so the LLM varies
   *  perspective. Same input + temperature 0.4 still produces variation, but
   *  the nonce also bypasses any future caching layer. */
  refresh_seed?: number;
  /** v0.2.4 PR-feedback-2 — Tier-2 augmentation IDs. List of baseline /
   *  conditional ids the user has already seen (rendered from Tier-1 static
   *  catalog). The backend prompt activates an "Augmentation Mode" block:
   *  keep these baselines AS-IS, only refine per-item or add NEW conditional
   *  items the user hasn't seen yet. Both fields are optional — omitting them
   *  preserves v0.2.3 prompt behavior 1:1. */
  prior_baseline_ids?: string[];
  prior_conditional_ids?: string[];
}

export interface RecommendHazardsResponse {
  /** baseline 항목. Phase 2.x PR-1 부터 각 항목 안에 per-item scenarios /
   *  mitigations / ppe 옵셔널 배열이 추가됐다 (1:N 매핑). 이전 PR F era
   *  클라이언트는 baseline 안의 per-item 필드를 읽지 않아도 정상 동작. */
  baseline: PreparedBaselineItem[];
  conditional: PreparedConditionalItem[];
  suggested_questions: string[];
  incident_cases: PreparedIncidentCase[];
  // PR F — Push paradigm: prepare 단계가 LLM 한 번 호출에서 위험 시나리오 +
  // 대응 조치 + 필수 보호구까지 함께 가져온다. 옵셔널 + 빈 배열 default
  // (legacy backend는 미반환). VoiceShell prefill useEffect가 이 값으로
  // structured.{risk_scenarios, mitigations, ppe} 1회 prefill.
  //
  // Phase 2.x PR-1 — backward compat 보존: 신규 클라이언트는
  // `baseline[i].scenarios` / `mitigations` / `ppe` 를 우선 사용하고,
  // 비어있으면 아래 flat 배열로 fallback 한다. 두 경로 모두 backend가 채움.
  scenarios?: PreparedScenarioItem[];
  mitigations?: PreparedMitigationItem[];
  ppe?: PreparedPpeItem[];
  /** PR A_v2-2: opaque catalog version string (e.g. "v0.2.0-1777842609"). */
  seed_revision?: string;
  /** PR A_v2-2: ISO timestamp of when the response was generated. */
  generated_at?: string;
  /** v0.2.6 PR-5: 비-한국어 사용자에게 ko-fallback 마이크로카피 노출 여부 가드.
   *  true → 응답의 모든 텍스트가 ko 폴백 → "AI가 곧 {언어}로 보강합니다" 노출.
   *  false → 1개라도 현지어가 채워져 있음 → 마이크로카피 숨김.
   *  catalogQuick.ts(1단 정적 카탈로그)만 채우고 backend /api/recommend-hazards
   *  (2단 LLM)는 미반환 → undefined로 도착하면 caller가 false로 간주. */
  content_only_ko_fallback?: boolean;
}

const handleNonOk = async (res: Response, ctx: string): Promise<never> => {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: string };
    detail = body.detail ?? "";
  } catch {
    // ignore parse errors; res.statusText is enough.
  }
  throw new Error(`${ctx} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
};

export async function fetchWorkTypes(domain: SessionDomain): Promise<WorkType[]> {
  const params = new URLSearchParams({ domain });
  const res = await fetch(`/api/work-types?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await handleNonOk(res, "fetchWorkTypes");
  return (await res.json()) as WorkType[];
}

export async function recommendHazards(
  body: RecommendHazardsRequestBody,
): Promise<RecommendHazardsResponse> {
  const res = await fetch("/api/recommend-hazards", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await handleNonOk(res, "recommendHazards");
  return (await res.json()) as RecommendHazardsResponse;
}

// ---------------------------------------------------------------------------
// v0.2.4 PR-feedback-2 — Tier-1 quick path. Re-export from catalogQuick so
// PrepareScreen has a single import surface for the recommendation API.
// recommendHazardsQuick reads the build-synced static catalog (≤300ms, no
// network), throws when the work_type_id isn't seeded — caller falls back
// to recommendHazards() in that case.
// ---------------------------------------------------------------------------
export { recommendHazardsQuick, catalogHasWorkType } from "./catalogQuick";

// ---------------------------------------------------------------------------
// PR B+ NEW-H3 — conditional `if` DSL → 한국어 라벨 변환.
// 단순 패턴 매칭으로 backend의 짧은 DSL을 사람이 읽을 수 있는 형태로 바꾼다.
// 매칭 실패 시 원문 fallback (영문 그대로) — 손실 0.
// 영어/베트남어 등 5언어 매핑은 Phase 2.1 i18n 묶음에서 (felix lock §6 Q10).
// ---------------------------------------------------------------------------

/**
 * `wind_speed >= 10` → "풍속 10 m/s 이상" 등.
 * 매핑 테이블은 backend 카탈로그와 LLM 출력에 등장하는 변수만 우선 커버.
 * 매칭 실패 시 원문 그대로 반환 (디버깅·감사 추적 손실 0).
 */
export function humanizeIfClause(
  ifExpr: string,
  language: SessionLanguage,
): string {
  const raw = (ifExpr ?? "").trim();
  if (!raw) return "";
  // 한국어 외 언어는 다음 cycle. 일단 원문 fallback.
  if (language !== "korean") return raw;

  // 1) `wind_speed[_mps] >= N` → "풍속 N m/s 이상"
  //    `<=` 도 동일 처리. 등호는 우선 무시.
  const windRe =
    /^\s*wind_speed(?:_mps)?\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/i;
  const wm = raw.match(windRe);
  if (wm) {
    const op = wm[1];
    const n = wm[2];
    const cmp = op === ">=" || op === ">" ? "이상" : "이하";
    return `풍속 ${n} m/s ${cmp}`;
  }

  // 2) `worker_count >= N` → "작업자 N명 이상"
  const workerRe =
    /^\s*worker_count\s*(>=|<=|>|<)\s*(-?\d+)\s*$/i;
  const wc = raw.match(workerRe);
  if (wc) {
    const op = wc[1];
    const n = wc[2];
    const cmp = op === ">=" || op === ">" ? "이상" : "이하";
    return `작업자 ${n}명 ${cmp}`;
  }

  // 3) `shift == "night"` / `shift = night` 등 → "야간 작업"
  //    교대값 매핑(주간/야간/교대 순환/기타).
  const shiftRe =
    /^\s*shift\s*(==|=)\s*['"]?([a-z_]+)['"]?\s*$/i;
  const sm = raw.match(shiftRe);
  if (sm) {
    const v = sm[2].toLowerCase();
    switch (v) {
      case "night":
        return "야간 작업";
      case "day":
        return "주간 작업";
      case "rotating":
        return "교대 순환 작업";
      case "other":
        return "기타 교대";
      default:
        return `교대: ${v}`;
    }
  }

  // 4) `new_material == true` / `new_material` (truthy) → "신규 자재 도입"
  const newMatRe = /^\s*new_material(\s*(==|=)\s*(true|1))?\s*$/i;
  if (newMatRe.test(raw)) {
    return "신규 자재 도입";
  }

  // fallback — 원문 그대로 (영문 DSL).
  return raw;
}
