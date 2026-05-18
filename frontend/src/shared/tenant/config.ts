// Tenant configuration for multi-PoC deployment (frontend mirror).
//
// Each PoC (customer-facing demo) is a TenantConfig: company name, app name,
// domain label overrides, hidden domains, and (Phase 3) EHS recommended
// question seeds. The active tenant is selected at build time via the
// VITE_TENANT_ID environment variable.
//
// To add a new customer PoC:
//   1. Add a new TenantConfig entry below.
//   2. Register it in TENANTS.
//   3. Set VITE_TENANT_ID=<id> in the Railway service for that customer
//      (and mirror it as TENANT_ID for the backend service).
//
// The backend domain keys are kept stable across tenants so IndexedDB session
// data and request/response contracts remain compatible. Only user-facing
// labels and content vary.

import type { SessionDomain } from "../../services/sessionModel";

export interface TenantConfig {
  id: string;
  companyName: string;
  appName: string;
  domainLabels: Record<SessionDomain, string>;
  // backend domain keys to hide from user-facing UI (still valid server-side)
  hiddenDomains: ReadonlySet<SessionDomain>;
  // Phase 3 — per-domain EHS recommended question seeds (filled later)
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

const LG_INNOTEK: TenantConfig = {
  id: "lg_innotek",
  companyName: "LG이노텍",
  appName: "Safety Vision",
  domainLabels: {
    manufacturing: "생산",
    construction: "건설",
    heavy_industry: "설비관리",
    semiconductor: "반도체",
  },
  hiddenDomains: new Set<SessionDomain>(["semiconductor"]),
  ehsRecommendedQuestions: {
    // 생산 — 광학·패키지·모빌리티 양산 라인
    manufacturing: [
      "카메라 모듈 조립 라인에 신규 UV 경화 광원이 도입됐는데 작업자 망막 보호 절차는 어떻게 정해야 해?",
      "FC-BGA 도금 라인의 산 미스트 폭로를 줄이려면 LEV 풍속 기준을 얼마로 잡아야 해?",
      "자율주행 LiDAR 센서 SMT 라인에서 Class 3R 적외선 광원 인터록 점검은 어느 주기로 해야 해?",
      "OLED 메탈 마스크 펨토초 레이저 가공 중 금속 흄 노출 기준과 환기 권고는?",
      "EV 파워모듈 DC 링크 캐패시터 잔류전압 측정 절차와 안전대기 시간은 어떻게 돼?",
      "클린룸에서 IPA 세정 시 정전기 화재 위험을 어떻게 평가하고 통제해야 해?",
      "스크린프린터 스퀴지 협착 사고 사례와 인터록 보강 방안 알려줘.",
      "AGV와 작업자 동선이 교차되는 구역에서 구역 분리 기준은 어떻게 정해야 해?",
      "솔더 리플로우 250°C 잔열·흄 환기 기준과 쿨링 대기 시간은?",
      "픽업 노즐 진공 흡착 장비 협착 방지 인터록은 어떻게 점검해?",
      "광학 모듈 조립 라인에 신규 작업자가 투입됐을 때 ESD 안전교육은 어떻게 구성해?",
      "AOI 검사기 Class 3B 레이저 가시광 누설 점검 주기와 측정 방법은?",
    ],
    // 설비관리 — 클린룸·노광·검사·도금 PM
    heavy_industry: [
      "노광 장비 RF generator 잔류전압 LOTO 절차와 검전 기준은?",
      "HF 잔류 약액 라인 DI 플러시 검증 방법과 pH 기준은?",
      "도금조 시안화물 약액이 산과 혼입됐을 때 HCN 발생 즉시 조치는 어떻게 해?",
      "특수가스 캐비닛 차압 게이지 알람 기준과 25% LEL 감지기 대응은?",
      "SiH4 자연발화 위험이 있는 가스 캐비닛 leak test 절차와 He 누설률 기준은?",
      "FFU 필터 교체 시 천장 안전대 부착점은 어떻게 확인하고 점검해?",
      "노광기 stepper 광학 정렬 calibration 중 작업자 보호 기준은?",
      "도금 라인 SOP 변경 시 외국인 작업자 재교육은 어떤 방식이 효과적이야?",
      "AOI 광학 검사장비 calibration 시 잔류 RF 검증은 어떤 절차로 해?",
      "클린룸 등급 Class 100 입자 오염 측정 주기와 알람 기준은?",
      "폐 ULPA 필터 분진 흡착 위험을 줄이는 처리 절차는 어떻게 돼?",
      "UPW 배관 점검 시 압력 해제와 group LOTO는 어떻게 적용해?",
    ],
    // 건설 — 팹 증설·클린룸 시공·설비 반입
    construction: [
      "클린룸 FFU 양중 시 천장 안전대 부착점은 어디로 잡아야 해?",
      "5톤 노광 장비 반입 경로의 raised floor 하중 검토는 어떤 절차로 해?",
      "특수가스 라인 가압 leak test 절차와 작업자 안전거리는 어떻게 정해?",
      "클린룸 시공 중 인접 가동 라인의 양압 손실을 막으려면 어떤 격리 조치가 필요해?",
      "도금 약액 라인 시공 중 시운전 약액이 누설됐을 때 즉시 대응은?",
      "케미컬 라인 cycle purge 회수 기준과 압력 강하 검증은?",
      "에폭시 도장 밀폐공간 작업의 환기 풍량과 가스 측정 주기는?",
      "강풍 시 외장 panel 비산을 막기 위한 양중 중단 풍속 기준은?",
      "가스 캐비닛 anchor 시공 토크 기준과 검사 항목은?",
      "raised floor 개구부 추락을 막기 위한 가설 펜스와 표지 기준은?",
      "인접 가동 fab을 보호하는 격리 차폐막 기준과 분진 통제는 어떻게 해?",
      "고압 인입 시 group lock LOTO 절차와 검전 단계는 어떻게 돼?",
    ],
  },
};

const TENANTS: Record<string, TenantConfig> = {
  [DEFAULT.id]: DEFAULT,
  [LG_INNOTEK.id]: LG_INNOTEK,
};

const ACTIVE_ID =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ?? DEFAULT.id;

export const tenant: TenantConfig = TENANTS[ACTIVE_ID] ?? DEFAULT;

export function isDomainVisible(domain: SessionDomain): boolean {
  return !tenant.hiddenDomains.has(domain);
}

export function domainLabel(domain: SessionDomain): string {
  return tenant.domainLabels[domain] ?? domain;
}
