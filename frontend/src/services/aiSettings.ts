// aiSettings — PR A_v2-3 (c8 §9 / felix decision §12-#7).
//
// Per-domain "AI 컨텍스트 활용" toggle. When OFF for a domain, the
// PrepareScreen context form is read-only (or hidden) and recommend-hazards
// requests omit the `context` field — backend then uses the static catalog
// seed only. baseline 추천은 정적 카탈로그만 사용.
//
// Storage: localStorage under `safemate.ai.contextEnabled.<domain>`.
// Defaults: 반도체 OFF (영업비밀 우려 — c5 §9.5). 그 외 ON.
//
// Notes
//   - SSR-safe: no `window` access in module scope.
//   - Legacy / undefined domain => allowed by default (returns true).

import type { SessionDomain } from "./sessionModel";

const KEY_PREFIX = "safemate.ai.contextEnabled.";

const DEFAULT_BY_DOMAIN: Record<SessionDomain, boolean> = {
  manufacturing: true,
  construction: true,
  heavy_industry: true,
  semiconductor: false,
};

export function isAiContextEnabled(domain: SessionDomain | undefined): boolean {
  if (!domain) return true; // legacy / 미지정 도메인은 허용 (회귀 0).
  if (typeof window === "undefined") return DEFAULT_BY_DOMAIN[domain];
  try {
    const v = window.localStorage.getItem(KEY_PREFIX + domain);
    if (v === null) return DEFAULT_BY_DOMAIN[domain];
    return v === "true";
  } catch {
    // private mode / quota — fall back to default.
    return DEFAULT_BY_DOMAIN[domain];
  }
}

export function setAiContextEnabled(domain: SessionDomain, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + domain, enabled ? "true" : "false");
  } catch {
    // private mode / quota — silently ignore.
  }
}

export function getAiContextDefault(domain: SessionDomain): boolean {
  return DEFAULT_BY_DOMAIN[domain];
}

/** Ordered list of all 4 domains for Settings UI rendering. */
export const ALL_DOMAINS: ReadonlyArray<SessionDomain> = [
  "manufacturing",
  "construction",
  "heavy_industry",
  "semiconductor",
];

// Domain labels are tenant-driven so each customer PoC presents its own
// terminology. Backend domain keys remain stable for IndexedDB/API compat.
import { tenant } from "../shared/tenant/config";

export const DOMAIN_LABEL_KO: Record<SessionDomain, string> = tenant.domainLabels;
