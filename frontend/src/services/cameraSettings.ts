// cameraSettings — PR C (Phase 2.0 MVP, c5 §9.5 / felix 결정 8).
//
// 도메인별 "카메라 사용 허용" 토글. AI 컨텍스트 토글(aiSettings.ts)과 별도
// 스토리지 키 — 두 토글의 의미 차이가 명확하다(컨텍스트 LLM 인전송 ↔ 카메라
// 캡처 진입 자체).
//
// Storage: localStorage `safemate.ui.cameraEnabled.<domain>`.
// Defaults (felix 결정 8):
//   - 반도체: OFF (영업비밀 / 사이트 보안 — c5 §9.5)
//   - 그 외 3 도메인: ON
//
// invariant #10: localStorage `safemate.ui.*` 네임스페이스 — IndexedDB 미유출.

import type { SessionDomain } from "./sessionModel";

const KEY_PREFIX = "safemate.ui.cameraEnabled.";

const DEFAULT_BY_DOMAIN: Record<SessionDomain, boolean> = {
  manufacturing: true,
  construction: true,
  heavy_industry: true,
  semiconductor: false,
};

export function isCameraEnabled(domain: SessionDomain | undefined): boolean {
  // legacy / 미지정 도메인은 허용 (회귀 0). felix HITL 시 별도 기본 정책 가능.
  if (!domain) return true;
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

export function setCameraEnabled(
  domain: SessionDomain,
  enabled: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY_PREFIX + domain,
      enabled ? "true" : "false",
    );
  } catch {
    // quota / 비활성 — silently ignore.
  }
}

export function getCameraEnabledDefault(domain: SessionDomain): boolean {
  return DEFAULT_BY_DOMAIN[domain];
}

// ── 1회 동의 모달 (c5 §9.6 / felix 결정 9) ─────────────────────────────────
// 카메라 첫 사용 시 1회 모달. localStorage `safemate.privacy.cameraConsent.v1`
// 미설정이면 모달 진입. 동의 시 "true" 저장 — 다음 진입부터 모달 미표시.
const CONSENT_KEY = "safemate.privacy.cameraConsent.v1";

export function hasCameraConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setCameraConsent(consented: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (consented) {
      window.localStorage.setItem(CONSENT_KEY, "true");
    } else {
      window.localStorage.removeItem(CONSENT_KEY);
    }
  } catch {
    // silent.
  }
}
