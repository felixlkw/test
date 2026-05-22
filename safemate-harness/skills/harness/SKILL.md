---
name: harness
description: SafeMate(SafeAssist) 멀티-PoC 프로젝트의 전문가 subagent 하네스를 오케스트레이션. 호반그룹/LG이노텍 등 고객사 PoC 작업 시 dev 4명(음성·TBM·테넌트·다국어), 디자인 2명(UI/UX·웹디자인), 안전공학 3명(일반·건설·전기), 호반그룹 분석가 2명(호반건설·대한전선), 목업 합성기 1명, 프로세스 2명(PM·Critic) 총 14 에이전트와 13개 절차 skill 을 상황에 맞게 단일/병렬 호출. 사용자가 /harness 또는 "전문가 하네스 써줘" 라고 할 때.
---

# Harness — SafeMate 전문가 오케스트레이션

이 skill은 SafeMate(SafeAssist) PoC 프로젝트의 작업을 받았을 때, 적절한 전문가 subagent로 분배하는 방법을 안내한다.

## 에이전트 카탈로그

### Dev — 개발 전문가
- **realtime-voice-engineer** — OpenAI Realtime/WebRTC/음성 흐름/STT 튜닝
- **tbm-flow-engineer** — TBM 세션 플로우, 체크리스트, IndexedDB
- **tenant-poc-engineer** — 멀티 테넌트, Railway, 고객사 분리
- **i18n-content-engineer** — 5개 언어 콘텐츠·glossary

### Design — 디자인 전문가
- **uiux-designer** — 음성 우선 인터랙션, 산업현장 접근성(장갑·소음·옥외), 정보 구조
- **web-designer** — Tailwind 토큰·테넌트 브랜드 시스템·로고·반응형·다크 모드

### Safety — 안전 전문가
- **industrial-safety-expert** — 산안기준규칙·KOSHA 일반
- **construction-safety-expert** — 추락·양중·굴착·공종별
- **electrical-safety-expert** — 케이블 제조·HV·LOTO·아크플래시

### Hoban Group — 사업유형 분석가
- **hoban-construction-analyst** — 호반건설/호반산업/호반리조트/대한조선 포트폴리오
- **daehan-cable-analyst** — 대한전선 공장·EPC·해외 사이트 포트폴리오

### Orchestrator — 데이터 합성기
- **safety-mockup-generator** — 분석가+안전전문가 출력을 카탈로그 JSON으로 합성

### Process — PM · 검수
- **project-manager** — 다단계 이니셔티브 WBS·시퀀싱·데드라인·리스크 (단발 요청은 이 skill 라우팅으로 충분, PM은 시간/의존성/다중 이해관계자 있는 일 전용)
- **critic** — 다른 에이전트 산출물의 사실관계·다국어·스키마·교차참조·stale·추측성 검수

## Skill 카탈로그 (절차/플레이북)

에이전트가 호출하거나 사용자가 `/<skill>` 로 직접 발동 가능한 세분화 procedure.

| Skill | 사용 시점 | 주 사용자 |
|---|---|---|
| `realtime-event-debug` | Realtime 회귀 진단 | realtime-voice-engineer |
| `railway-ops` | Railway CLI 운영 | tenant-poc-engineer |
| `tenant-add` | 새 PoC 테넌트 등록 (6단계) | tenant-poc-engineer |
| `i18n-5lang` | 5개 언어 번역 | i18n-content-engineer, safety-mockup-generator |
| `glossary-stt-entry` | STT 부스팅 어휘 추가 | i18n-content-engineer |
| `kosha-citation` | 한국 안전법령·KOSHA 인용 포맷 | 3개 safety expert |
| `risk-assessment-5step` | 위험성평가 5단계 프레임워크 | 3개 safety expert |
| `business-verify` | 외부 기업·자회사 web search 검증 | 2개 analyst, critic |
| `wcag-industrial` | 산업현장 WCAG AAA 감사 | uiux-designer, web-designer |
| `tenant-brand-tokens` | Tailwind 토큰 테넌트 분리 | web-designer |
| `mockup-schema` | 목업 JSON 스키마·검증·승격 | safety-mockup-generator, critic, tbm-flow-engineer |
| `poc-readiness` | PoC 데모 8영역 게이트 점검 | project-manager |
| `factcheck-entities` | 법령·API·통계·기업 인용 등급 검증 | critic |

## 라우팅 가이드 (요청 유형 → 호출 패턴)

| 요청 | 호출 패턴 |
|---|---|
| "그리팅/말풍선/자동발화 안 됨" | realtime-voice-engineer 단독 |
| "TBM 흐름 / 체크리스트 추가" | tbm-flow-engineer 단독; 카탈로그 변경 시 i18n-content-engineer 병렬 |
| "새 고객사 PoC 추가" | tenant-poc-engineer 단독 |
| "다국어 누락 / glossary 보강" | i18n-content-engineer 단독 |
| "화면 흐름 / 사용성 / 접근성 검토" | uiux-designer 단독 |
| "디자인 시스템 / 색·타이포·로고 / 테넌트 브랜드" | web-designer 단독 |
| "새 화면 디자인 (인터랙션 + 비주얼)" | uiux-designer + web-designer 병렬 → 구현은 dev 엔지니어 |
| "기존 화면 비주얼만 개선" | web-designer 단독 |
| "건설 안전 베스트프랙티스 질문" | construction-safety-expert + industrial-safety-expert 병렬 |
| "케이블 제조 안전 질문" | electrical-safety-expert + industrial-safety-expert 병렬 |
| "해저/지중 케이블 포설 안전" | construction-safety-expert + electrical-safety-expert 병렬 (구조/양중 + 전기 측면 둘 다 필요) |
| "호반그룹 사업유형 자체에 대한 질문" | hoban-construction-analyst 단독 |
| "대한전선 공정/사이트 자체에 대한 질문" | daehan-cable-analyst 단독 |
| **"호반/대한전선 목업 카탈로그 만들어줘" (데이터 합성)** | **safety-mockup-generator 단독** — 내부에서 필요한 분석가·안전전문가·i18n을 호출. 호출자가 직접 분배하지 말 것. |
| "새 work_type 추가 + 카탈로그 + 다국어 (정식 운영 데이터)" | safety-mockup-generator → 결과물을 tbm-flow-engineer가 정식 카탈로그로 승격 (sequential) |
| "PoC 데모 D-N 점검 / 출시 게이트 / 남은 작업 정리" | project-manager 단독 (PM이 내부적으로 다른 에이전트 위임) |
| "여러 단계 이니셔티브 (예: 테넌트 추가 + 브랜딩 + 콘텐츠 + 데모 검증)" | project-manager 단독 — WBS 잡고 위임 |
| "방금 만든 산출물 사실관계·완성도 검수" | critic 단독 |
| "분석가/안전전문가가 작성한 내용의 외부 인용 검증" | critic + factcheck-entities skill |

## 호출 원칙

1. **독립적이면 병렬** — `Agent` 도구를 단일 메시지에 여러 번 호출해서 동시 실행.
2. **종속적이면 순차** — 한 에이전트 출력이 다음 에이전트 입력일 때.
3. **데이터 합성은 항상 safety-mockup-generator 경유** — work_type/baseline/scenarios/mitigations/ppe 가 들어가는 JSON을 만드는 일은 직접 분석가나 안전전문가를 호출하지 않는다. generator가 내부 분배 책임을 진다. (조회·자문성 질문은 분석가·전문가 직접 호출 OK.)
4. **단일 에이전트로 충분하면 단일** — 과도한 분배는 컨텍스트 낭비.
5. **다단계는 PM 위임, 검수는 Critic 위임** — PM/Critic 본인이 작업하지 않고 위임/검수만 한다. 직접 코드/콘텐츠 생성 요청은 다른 에이전트로 보낸다.
6. **중요 산출물은 critic 후속 검수 권장** — 특히 외부 기업·법령 인용이 포함된 경우.

## 도메인 경계 메모

- 해저·지중 케이블 포설은 **construction(양중·맨홀 밀폐·기상) + electrical(활선·잔류전하·아크) 양쪽 위험이 공존**. 단일 안전전문가로 부족. mockup-generator가 두 전문가를 모두 호출해야 한다.
- 조선소 블록 작업은 construction-safety-expert가 1차 담당, 협소공간 가스(아세틸렌·아르곤·잔류 도장 용제)는 industrial-safety-expert 협업.

## 출력 디렉토리 약속

목업 데이터: `backend/data/mockup_hoban/<company>/<WORK_TYPE>.json` 또는 `backend/data/mockup_hoban/<company>.json`.
정식 운영 데이터로 승격 시 `backend/data/checklist_catalog/<domain>.json` 으로 이동.

## 이 skill을 호출했을 때

사용자 요청을 위 라우팅 표와 매칭해서 **어떤 에이전트(들)을 호출할지 한 문장으로 선언**한 뒤 즉시 `Agent` 도구 호출. 라우팅이 모호하면 사용자에게 짧게 확인.
