# SafeMate KPI — Phase 0.6 Conversational TBM

Critic P0 acceptance #1: "성공 기준 정의 부재" — 이 문서가 그 해소.
이 문서는 "혁신했다"의 정량 기준을 정의하고, 측정 방법까지 명시한다.

## 1. 핵심 KPI

| # | 지표 | 목표 | 측정 방법 | 측정 시점 |
|---|---|---|---|---|
| K1 | **LLM 도구 호출 성공률** | ≥ 90% | `getToolCallStats().overallSuccessRate` | 매 세션 종료 시 + 일간 누적 |
| K2 | **conversational TBM 완료 시간** | 기존 form-driven 대비 단축 30% | finalize_tbm 호출 시점 − enter_tbm_mode 호출 시점 | 세션 단위 |
| K3 | **외국인 작업자 8필드 정확률** | ≥ 85% | 세션의 prior_info + structured 8필드가 finalize 시점에 채워진 비율 (사용자 자가 검증 모드) | 세션 단위 |
| K4 | **디그레션 → 재개 성공률** | ≥ 80% | pause_tbm 호출 수 대비 resume_tbm 호출 수 | 일간 |
| K5 | **finalize gate 통과율** | ≥ 95% (즉, 미충족 차단 ≤ 5%) | finalize_tbm 호출 시 mandatory 4필드 미충족 차단 횟수 | 일간 |
| K6 | **세션당 prompt 토큰 누적** | ≤ 8,000 tokens (100턴 가정) | backend logging via prompt token counter | 세션 단위 |
| K7 | **모드 전환 사용자 만족도** | NPS ≥ 7/10 | 데모 후 5명 사용자 자기보고 (Wave 5) | Phase end |

## 2. 측정 인프라

### K1 — 도구 호출 성공률 (frontend)
`frontend/src/features/tbm/toolTelemetry.ts`:
- `recordToolCall({ name, status })` — useWebRTCEvents가 매 도구 호출 후 자동 기록
- `getToolCallStats()` — localStorage 누적치 집계
- 상한: 200 entries (오래된 것부터 drop)

추후 backend export 권장: localStorage 데이터를 PoC 데모 후 사용자가 직접 export, 또는 IndexedDB로 영속.

### K2 — TBM 완료 시간
도구 호출 timestamp 기반 계산:
```ts
const stats = getToolCallStats();
const enter = stats.recent.find(e => e.name === "enter_tbm_mode" && e.status === "success");
const finalize = stats.recent.find(e => e.name === "finalize_tbm" && e.status === "success");
// duration = finalize.ts - enter.ts
```

비교 기준: 기존 form-driven 흐름 (Prepare → Run → Finish 평균 시간 — 사전 측정 필요).

### K3 — 외국인 작업자 정확률
세션 finalize 시점에:
- `session.prior_info` 4슬롯 채움 비율
- `session.structured_checklist` 8필드 채움 비율
- 사용자 언어 ≠ 한국어 세션만 집계
- 별도 사용자 자가검증 토글 ("내가 한 말이 맞아?")

### K4 — pause/resume 짝맞춤
도구 호출 로그 시계열에서 pause 와 다음 resume 사이 gap.
- gap 0~5분 = 정상 디그레션
- gap 5분 초과 = cancel 로 간주 (사용자가 잊었거나 포기)

### K5 — finalize gate
backend `finalize_tbm` handler에 mandatory 필드 검증 추가:
- mandatory = [domain, work_summary/work_type_label, hazards, ppe or attendance]
- 미충족 시 LLM 에 `{result: "blocked", missing: [...]}` 응답 → LLM 이 사용자에게 보강 요청

### K6 — Prompt 토큰
backend `generate_webrtc_key` 응답에 instructions 길이 포함 → tiktoken 으로 사후 계산.
세션당 instructions × 발화 횟수 추정.

### K7 — NPS
별도 사용자 인터뷰 (5명 × 호반건설 외국인 작업자).

## 3. 대시보드

Phase 0.7 (Wave 5) 에서 Settings 화면에 KPI 대시보드 추가 예정.
임시: localStorage 직접 확인:
```js
// 브라우저 console
JSON.parse(localStorage.getItem("safemate.telemetry.toolCalls.v1"))
```

## 4. 거버넌스

- 매주 K1, K4, K5 측정 → harness `project-manager` 가 주간 보고
- K2, K3 은 매 PoC 데모 직후 측정
- K6 은 backend 로그 (Railway logs) 에서 일간 집계
- 어떤 지표든 2주 연속 목표 미달 시 critic 검수 trigger

## 5. Out of scope (현 단계)

- A/B 테스트 인프라 — 사용자 1팀 만이라 효과 측정 어려움
- 회귀 테스트 커버리지 % — 별도 Playwright report
- 비용 절감 — Phase 0.7 이후 분석
