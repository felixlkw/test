// catalogQuick.ts — v0.2.4 PR-feedback-2 Tier-1 hazard recommendation source.
//
// Mirrors backend `_seeded_baseline_with_source` + `_flatten_seed_conditional`
// (test/backend/src/llm.py:367-476) so the on-the-wire shape returned to
// PrepareScreen is bit-for-bit equivalent regardless of whether the response
// came from the static catalog (this module) or from the LLM endpoint
// (services/recommendHazards.ts).
//
// Why a separate module:
//   PrepareScreen wants a synchronous-feeling ≤300ms render path the moment a
//   work-type chip is tapped. The build-time catalog sync (scripts/sync-
//   catalog.mjs) places the same JSON the backend reads at
//   `frontend/src/generated/catalog/{domain}.json`; vite + dynamic import()
//   gives us per-domain code-split chunks (~10 KB each) without parsing all
//   four upfront.
//
// Failure model:
//   - Unknown domain      → throw (caller bails to backend POST fallback).
//   - Unknown work_type_id → throw (caller bails to backend POST fallback).
//   The PrepareScreen caller catches and falls back to /api/recommend-hazards.
//   This keeps the v0.2.3 contract intact for any work-type that exists in
//   the LLM-driven path but not in the static seed.

import type {
  PreparedBaselineItem,
  PreparedConditionalItem,
  PreparedMitigationItem,
  PreparedPpeItem,
  PreparedScenarioItem,
  SessionDomain,
  SessionLanguage,
} from "./sessionModel";
import type { RecommendHazardsResponse } from "./recommendHazards";
import { pickContent, isKoFallback } from "./catalogI18n";

// ---------------------------------------------------------------------------
// On-disk catalog shapes — loose-by-design to mirror the JSON exactly
// without leaking unknown-key bugs at run time. All fields optional.
// ---------------------------------------------------------------------------
interface RawPerItem {
  id?: unknown;
  content?: unknown;
  // v0.2.6 — 다국어 필드 옵셔널. 미지정 시 ko 폴백(catalogI18n.pickContent).
  content_en?: unknown;
  content_vi?: unknown;
  content_th?: unknown;
  content_id?: unknown;
}
interface RawBaseline {
  id?: unknown;
  content?: unknown;
  content_en?: unknown;
  content_vi?: unknown;
  content_th?: unknown;
  content_id?: unknown;
  regulation?: unknown;
  evidence_required?: unknown;
  scenarios?: unknown;
  mitigations?: unknown;
  ppe?: unknown;
}
interface RawConditional {
  if?: unknown;
  add?: {
    id?: unknown;
    content?: unknown;
    content_en?: unknown;
    content_vi?: unknown;
    content_th?: unknown;
    content_id?: unknown;
    regulation?: unknown;
  };
}
interface RawWorkType {
  label_ko?: unknown;
  label_en?: unknown;
  baseline?: unknown;
  conditional?: unknown;
  suggested_questions?: unknown;
}
interface RawCatalog {
  domain?: unknown;
  version?: unknown;
  work_types?: Record<string, RawWorkType>;
}

// ---------------------------------------------------------------------------
// Lazy per-domain loader — uses Vite's dynamic import() on a literal pattern
// so each domain becomes its own code-split chunk. The leading `./` is
// required for Vite's import-analysis to recognize the URL pattern.
// ---------------------------------------------------------------------------
const _domainCache = new Map<SessionDomain, RawCatalog>();

async function loadCatalog(domain: SessionDomain): Promise<RawCatalog> {
  const cached = _domainCache.get(domain);
  if (cached) return cached;
  // Vite turns this into a 4-way switch with statically known chunk URLs.
  // The `?import` query forces JSON-as-module loading.
  const mod = (await import(`../generated/catalog/${domain}.json`)) as {
    default: RawCatalog;
  };
  const data = mod.default;
  _domainCache.set(domain, data);
  return data;
}

// ---------------------------------------------------------------------------
// Helpers — value-narrowing + safe defaults. No `any`, all unknown→typed.
// ---------------------------------------------------------------------------
function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asOptString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// v0.2.6 — 다국어 필드 적용 시 ko 폴백 통계를 caller에 알리기 위해
// fallback counter 객체를 normalize 함수들에 전달. mutable carrier로 사용.
interface FallbackCounter {
  total: number; // 누적 content 항목 수(빈 ko 항목은 제외)
  koFallbacks: number; // 그 중 현지어 필드가 비어 ko 폴백으로 표시된 수
}

/** backend `_seeded_baseline_with_source` 1:1 — splice per-item arrays +
 *  stamp source='catalog' on baseline + per-item entries.
 *  v0.2.6: language별 content_<lang> 우선 선택 + ko-fallback counter 누적. */
function normalizeBaseline(
  raw: unknown,
  language: SessionLanguage,
  counter: FallbackCounter,
): PreparedBaselineItem[] {
  const out: PreparedBaselineItem[] = [];
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const b = entry as RawBaseline;
    const id = asString(b.id);
    if (!id) continue;
    const content = pickContent(b, language);
    if (!content) continue;
    counter.total += 1;
    if (isKoFallback(b, language)) counter.koFallbacks += 1;

    const item: PreparedBaselineItem = {
      id,
      content,
      regulation: asOptString(b.regulation),
      evidence_required: asOptString(b.evidence_required),
      source: "catalog",
      scenarios: normalizePerItem(b.scenarios, `${id}-SC`, language, counter),
      mitigations: normalizePerItem(b.mitigations, `${id}-MIT`, language, counter),
      ppe: normalizePerItem(b.ppe, `${id}-PPE`, language, counter),
    };
    out.push(item);
  }
  return out;
}

function normalizePerItem(
  raw: unknown,
  defaultIdPrefix: string,
  language: SessionLanguage,
  counter: FallbackCounter,
): PreparedScenarioItem[] {
  const out: PreparedScenarioItem[] = [];
  let idx = 0;
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as RawPerItem;
    const content = pickContent(e, language).trim();
    if (!content) continue;
    counter.total += 1;
    if (isKoFallback(e, language)) counter.koFallbacks += 1;
    idx += 1;
    const id = asString(e.id).trim() || `${defaultIdPrefix}-${idx}`;
    out.push({ id, content, source: "catalog" });
  }
  return out;
}

/** backend `_flatten_seed_conditional` 1:1.
 *  v0.2.6: conditional `add.content` 도 language 분기 + ko-fallback counter. */
function normalizeConditional(
  raw: unknown,
  language: SessionLanguage,
  counter: FallbackCounter,
): PreparedConditionalItem[] {
  const out: PreparedConditionalItem[] = [];
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as RawConditional;
    const add = c.add ?? {};
    const id = asString(add.id);
    const content = pickContent(add, language);
    if (!id || !content) continue;
    counter.total += 1;
    if (isKoFallback(add, language)) counter.koFallbacks += 1;
    out.push({
      if: asString(c.if),
      id,
      content,
      regulation: asOptString(add.regulation),
      source: "catalog",
    });
  }
  return out;
}

/** Aggregate per-item arrays across baselines into top-level flat arrays
 *  (de-duplicated by id) — backward compat for clients that only read the
 *  flat shape. Mirrors backend `_fallback_recommend_response`. */
function aggregateFlat(
  baseline: PreparedBaselineItem[],
): {
  scenarios: PreparedScenarioItem[];
  mitigations: PreparedMitigationItem[];
  ppe: PreparedPpeItem[];
} {
  const scenarios: PreparedScenarioItem[] = [];
  const mitigations: PreparedMitigationItem[] = [];
  const ppe: PreparedPpeItem[] = [];
  const sSeen = new Set<string>();
  const mSeen = new Set<string>();
  const pSeen = new Set<string>();
  for (const b of baseline) {
    for (const s of b.scenarios ?? []) {
      if (!sSeen.has(s.id)) {
        scenarios.push(s);
        sSeen.add(s.id);
      }
    }
    for (const m of b.mitigations ?? []) {
      if (!mSeen.has(m.id)) {
        mitigations.push(m);
        mSeen.add(m.id);
      }
    }
    for (const p of b.ppe ?? []) {
      if (!pSeen.has(p.id)) {
        ppe.push(p);
        pSeen.add(p.id);
      }
    }
  }
  return { scenarios, mitigations, ppe };
}

/** Tiny Korean confirmation pattern fallback — mirrors backend
 *  `_build_fallback_seed_questions`. Only used when the entry has no
 *  `suggested_questions` field. */
function buildFallbackQuestions(baseline: PreparedBaselineItem[]): string[] {
  const out: string[] = [];
  for (const b of baseline.slice(0, 4)) {
    const c = (b.content ?? "").trim();
    if (c) out.push(`${c} 확인하셨나요?`);
  }
  if (out.length === 0) out.push("작업 전 안전 점검은 모두 완료하셨나요?");
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Synchronous-feeling Tier-1 hazard recommendation from the build-time
 *  catalog. Throws when the work-type isn't in the catalog so callers can
 *  fall back to the LLM endpoint without ambiguity.
 *
 *  v0.2.6 PR-5: `language` 옵셔널 인자 추가. 각 텍스트 필드를
 *  `content_<lang>` 우선 + ko 폴백으로 선택한다. 또한 응답에
 *  `content_only_ko_fallback` 플래그를 채워 caller(PrepareScreen)가 비-한국어
 *  마이크로카피 노출 여부를 결정한다.
 *  - language="korean" 또는 미지정 → 항상 ko `content` 사용, 플래그 false.
 *  - 비-한국어 + 모든 항목이 현지어 비어있음 → 플래그 true(마이크로카피 노출).
 *  - 비-한국어 + 1개라도 현지어 있음 → 플래그 false(마이크로카피 숨김).
 *
 *  language 옵셔널 — 미지정 시 "korean"으로 처리해 v0.2.5 호출부와 동일 결과. */
export async function recommendHazardsQuick(args: {
  domain: SessionDomain;
  workTypeId: string;
  language?: SessionLanguage;
}): Promise<RecommendHazardsResponse> {
  const { domain, workTypeId } = args;
  const language: SessionLanguage = args.language ?? "korean";
  const catalog = await loadCatalog(domain);
  const workTypes = catalog.work_types ?? {};
  const entry = workTypes[workTypeId];
  if (!entry) {
    throw new Error(
      `catalogQuick: work_type_id '${workTypeId}' not in domain '${domain}' catalog`,
    );
  }
  const counter: FallbackCounter = { total: 0, koFallbacks: 0 };
  const baseline = normalizeBaseline(entry.baseline, language, counter);
  const conditional = normalizeConditional(entry.conditional, language, counter);
  const { scenarios, mitigations, ppe } = aggregateFlat(baseline);

  const rawQs = entry.suggested_questions;
  const suggested_questions: string[] = Array.isArray(rawQs)
    ? rawQs.filter((q): q is string => typeof q === "string" && q.length > 0)
    : [];
  const finalQs =
    suggested_questions.length > 0
      ? suggested_questions
      : buildFallbackQuestions(baseline);

  // 플래그 계산:
  //   language="korean" → 항상 false (한국어 사용자에게는 마이크로카피 무의미).
  //   다른 언어 + counter.total > 0 + 모두 ko 폴백 → true.
  //   다른 언어 + 1개라도 현지어 있음 → false.
  //   비어있는(total=0) 카탈로그는 폴백/현지어 구분 의미 없음 → false.
  const contentOnlyKoFallback =
    language !== "korean" &&
    counter.total > 0 &&
    counter.koFallbacks === counter.total;

  const version = asString(catalog.version, "static");
  return {
    baseline,
    conditional,
    suggested_questions: finalQs,
    incident_cases: [],
    scenarios,
    mitigations,
    ppe,
    seed_revision: `catalog-static-${version}`,
    generated_at: new Date().toISOString(),
    content_only_ko_fallback: contentOnlyKoFallback,
  };
}

/** Defensive helper for tests / dev tooling — does the static catalog know
 *  about this work_type_id? PrepareScreen does NOT need this (it just calls
 *  recommendHazardsQuick and catches), but keeping the predicate available
 *  for future caching layers. */
export async function catalogHasWorkType(
  domain: SessionDomain,
  workTypeId: string,
): Promise<boolean> {
  try {
    const catalog = await loadCatalog(domain);
    return Boolean(catalog.work_types?.[workTypeId]);
  } catch {
    return false;
  }
}
