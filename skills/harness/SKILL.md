---
name: harness
description: SafeMate(SafeAssist) 멀티-PoC 프로젝트의 전문가 subagent 하네스를 오케스트레이션. 호반그룹/LG이노텍 등 고객사 PoC 작업 시 음성·TBM·테넌트·다국어 dev 전문가 4명, 안전공학 전문가 3명(일반/건설/전기), 호반그룹 분석가 2명(호반건설/대한전선), 목업 데이터 합성기 1명 총 10개 에이전트를 상황에 맞게 단일/병렬 호출. 사용자가 /harness 또는 "전문가 하네스 써줘" 라고 할 때.
---

# Harness — SafeMate 전문가 오케스트레이션

이 skill은 SafeMate(SafeAssist) PoC 프로젝트의 작업을 받았을 때, 적절한 전문가 subagent로 분배하는 방법을 안내한다.

## 에이전트 카탈로그

### Dev — 개발 전문가
- **realtime-voice-engineer** — OpenAI Realtime/WebRTC/음성 흐름/STT 튜닝
- **tbm-flow-engineer** — TBM 세션 플로우, 체크리스트, IndexedDB
- **tenant-poc-engineer** — 멀티 테넌트, Railway, 고객사 분리
- **i18n-content-engineer** — 5개 언어 콘텐츠·glossary

### Safety — 안전 전문가
- **industrial-safety-expert** — 산안기준규칙·KOSHA 일반
- **construction-safety-expert** — 추락·양중·굴착·공종별
- **electrical-safety-expert** — 케이블 제조·HV·LOTO·아크플래시

### Hoban Group — 사업유형 분석가
- **hoban-construction-analyst** — 호반건설/호반산업/호반리조트/대한조선 포트폴리오
- **daehan-cable-analyst** — 대한전선 공장·EPC·해외 사이트 포트폴리오

### Orchestrator — 데이터 합성기
- **safety-mockup-generator** — 분석가+안전전문가 출력을 카탈로그 JSON으로 합성

## 라우팅 가이드 (요청 유형 → 호출 패턴)

| 요청 | 호출 패턴 |
|---|---|
| "그리팅/말풍선/자동발화 안 됨" | realtime-voice-engineer 단독 |
| "TBM 흐름 / 체크리스트 추가" | tbm-flow-engineer 단독; 카탈로그 변경 시 i18n-content-engineer 병렬 |
| "새 고객사 PoC 추가" | tenant-poc-engineer 단독 |
| "다국어 누락 / glossary 보강" | i18n-content-engineer 단독 |
| "건설 안전 베스트프랙티스 질문" | construction-safety-expert + industrial-safety-expert 병렬 |
| "케이블 제조 안전 질문" | electrical-safety-expert + industrial-safety-expert 병렬 |
| "해저/지중 케이블 포설 안전" | construction-safety-expert + electrical-safety-expert 병렬 (구조/양중 + 전기 측면 둘 다 필요) |
| "호반그룹 사업유형 자체에 대한 질문" | hoban-construction-analyst 단독 |
| "대한전선 공정/사이트 자체에 대한 질문" | daehan-cable-analyst 단독 |
| **"호반/대한전선 목업 카탈로그 만들어줘" (데이터 합성)** | **safety-mockup-generator 단독** — 내부에서 필요한 분석가·안전전문가·i18n을 호출. 호출자가 직접 분배하지 말 것. |
| "새 work_type 추가 + 카탈로그 + 다국어 (정식 운영 데이터)" | safety-mockup-generator → 결과물을 tbm-flow-engineer가 정식 카탈로그로 승격 (sequential) |

## 호출 원칙

1. **독립적이면 병렬** — `Agent` 도구를 단일 메시지에 여러 번 호출해서 동시 실행.
2. **종속적이면 순차** — 한 에이전트 출력이 다음 에이전트 입력일 때.
3. **데이터 합성은 항상 safety-mockup-generator 경유** — work_type/baseline/scenarios/mitigations/ppe 가 들어가는 JSON을 만드는 일은 직접 분석가나 안전전문가를 호출하지 않는다. generator가 내부 분배 책임을 진다. (조회·자문성 질문은 분석가·전문가 직접 호출 OK.)
4. **단일 에이전트로 충분하면 단일** — 과도한 분배는 컨텍스트 낭비.

## 도메인 경계 메모

- 해저·지중 케이블 포설은 **construction(양중·맨홀 밀폐·기상) + electrical(활선·잔류전하·아크) 양쪽 위험이 공존**. 단일 안전전문가로 부족. mockup-generator가 두 전문가를 모두 호출해야 한다.
- 조선소 블록 작업은 construction-safety-expert가 1차 담당, 협소공간 가스(아세틸렌·아르곤·잔류 도장 용제)는 industrial-safety-expert 협업.

## 출력 디렉토리 약속

목업 데이터: `backend/data/mockup_hoban/<company>/<WORK_TYPE>.json` 또는 `backend/data/mockup_hoban/<company>.json`.
정식 운영 데이터로 승격 시 `backend/data/checklist_catalog/<domain>.json` 으로 이동.

## 이 skill을 호출했을 때

사용자 요청을 위 라우팅 표와 매칭해서 **어떤 에이전트(들)을 호출할지 한 문장으로 선언**한 뒤 즉시 `Agent` 도구 호출. 라우팅이 모호하면 사용자에게 짧게 확인.
