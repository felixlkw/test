// Tenant configuration — Hoban Group SafeMate (frontend mirror).
//
// Branch client/hoban-safemate is dedicated to Hoban Group with two
// priority subsidiaries:
//   • 호반건설 (Hoban E&C) — apartments, mixed-use, civil SOC, resorts
//   • 대한전선 (Taihan Cable) — cable manufacturing + EPC (cable laying,
//     substation construction)
//
// Other subsidiaries (호반산업·호반리조트·대한조선) are folded into
// construction where relevant. heavy_industry / semiconductor domains are
// hidden from the Hoban UI.

import type { SessionDomain } from "../../services/sessionModel";

export interface TenantConfig {
  id: string;
  companyName: string;
  appName: string;
  domainLabels: Record<SessionDomain, string>;
  hiddenDomains: ReadonlySet<SessionDomain>;
  ehsRecommendedQuestions: Partial<Record<SessionDomain, string[]>>;
}

const DEFAULT: TenantConfig = {
  id: "default",
  companyName: "Samsung",
  appName: "SafeMate",
  domainLabels: {
    manufacturing: "제조",
    construction: "건설",
    heavy_industry: "중공업",
    semiconductor: "반도체",
  },
  hiddenDomains: new Set<SessionDomain>(),
  ehsRecommendedQuestions: {},
};

const HOBAN: TenantConfig = {
  id: "hoban",
  companyName: "호반그룹",
  appName: "호반 세이프",
  domainLabels: {
    // 'manufacturing' 키는 대한전선 케이블 공장 의미로 재용도.
    manufacturing: "케이블 제조",
    construction: "건설",
    heavy_industry: "중공업",
    semiconductor: "반도체",
  },
  hiddenDomains: new Set<SessionDomain>(["heavy_industry", "semiconductor"]),
  ehsRecommendedQuestions: {
    // 건설 — 호반건설 시공 + 대한전선 EPC
    construction: [
      "호반써밋 RC 골조 갱폼 인양 시 강풍 풍속 기준과 신호수 배치는 어떻게 해야 해?",
      "지하주차장 흙막이 공사 중 인접 구조물 침하 모니터링 기준과 대응은?",
      "베르디움 마감공정에서 외국인 도장팀 유기용제 노출을 줄이는 환기 계획은?",
      "타워크레인 2대 동시 운용 시 인접 반경 충돌 방지 절차와 신호 체계는?",
      "지하 정화조·집수정 진입 전 산소 농도와 황화수소 측정 기준은?",
      "리솜리조트 증축 현장에서 운영 중 객실 동선과 공사 동선 분리 기준은?",
      "민자 도로 터널 굴착 중 막장 붕괴 징후를 어떤 모니터링으로 잡아?",
      "콘크리트 타설 중 동바리 좌굴 징후를 작업자가 어떻게 인지하고 신고해?",
      "베트남·태국·우즈벡 신규 작업자 입소 교육에 픽토그램·모국어 자료는 어떻게 준비해?",
      "대한전선 지중 케이블 풀링 시 맨홀 밀폐공간 가스 측정과 환기 절차는?",
      "변전소 시공 중 인접 활선 이격거리 점검과 LOTO 검전·단락접지 절차는?",
      "해저케이블 선상 포설 시 강풍·파고 게이트와 잠수 인터페이스 안전 절차는?",
    ],
    // 케이블 제조 — 대한전선 안양·당진·베트남 공장
    manufacturing: [
      "동조괴 연속주조 1100°C 용탕 비산을 막는 차폐벽·PPE·비상정지 절차는?",
      "도체 연신 공정 권취 협착 사고 예방을 위한 인터록과 비상정지 점검 주기는?",
      "XLPE 압출 라인 가교가스(쿠멘 하이드로퍼옥사이드) 누설 시 환기·LEL 모니터링 기준은?",
      "납 시즈 압출 공정에서 납 흄 TLV 0.05 mg/m³ 유지 환기·국소배기 점검은?",
      "차폐 편조 권취 협착 방지 인터록과 신규 작업자 교육은 어떻게 운영해?",
      "50톤급 케이블 드럼 권취·이송 중 전도 방지 표준 결박과 양중 절차는?",
      "HV 시험장 250 kV 인가 후 잔류전하 방전 시간(시정수 × 5)과 검전 절차는?",
      "부분방전(PD) 시험장 출입 인터록과 비상정지 검증 주기는?",
      "당진 해저케이블 수직 압출장 회전 드럼 협착·낙하 방지 절차는?",
      "베트남 공장 현지 작업자 LOTO·검전·단락접지 표준 손짓 정착 방안은?",
      "케이블 드럼 창고 협소공간 점검 시 O2 18~23.5% 측정과 단독작업 금지는?",
      "광케이블 클린룸 작업 시 정전기 화재·먼지 통제와 ESD 접지 기준은?",
    ],
  },
};

const TENANTS: Record<string, TenantConfig> = {
  [DEFAULT.id]: DEFAULT,
  [HOBAN.id]: HOBAN,
};

const ACTIVE_ID =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ?? HOBAN.id;

export const tenant: TenantConfig = TENANTS[ACTIVE_ID] ?? HOBAN;

export function isDomainVisible(domain: SessionDomain): boolean {
  return !tenant.hiddenDomains.has(domain);
}

export function domainLabel(domain: SessionDomain): string {
  return tenant.domainLabels[domain] ?? domain;
}
