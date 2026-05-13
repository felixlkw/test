# PR-1 Delivery — v0.2.8 → v0.2.9 사전정보 가시성 quick fix

- 베이스: v0.2.8 (commit 58a3787, main, Railway 배포)
- 타깃: v0.2.9
- 범위: ChecklistPanel "사전 정보" 박스 worker_count fallback + work_type_label → workContentDetails 1회 mirror + 헬스 엔드포인트 version 문자열 정리
- 명세: `_workspace/feedback_2026-05-14_pr_plan.md` §PR-1 + 사용자 결정(요청서)
- 사용자 결정 차이: `numberOfWorkers === 0` 처리는 명세의 `!== undefined` 강화 대신 **falsy(0=미입력) 유지**. preparedContext.worker_count 0도 동일 처리.

---

## 변경 파일 4건

1. **`frontend/src/features/tbm/ChecklistPanel.tsx`**
   - `import type { PreparedContext } from "../../services/sessionModel";` 추가
   - `ChecklistPanelProps`에 옵셔널 `preparedContext?: PreparedContext` 추가
   - 컴포넌트 함수 시그니처에 `preparedContext` 인자 추가
   - "작업자수" PriorRow 표현식:
     `priorInfo.numberOfWorkers ? ... : preparedContext?.worker_count ? ... : undefined` (falsy 분기 유지 — 0=미입력)
   - 나머지 3 PriorRow(workLocation/workContentDetails/equipmentDetails)는 그대로

2. **`frontend/src/shared/layout/VoiceShell.tsx`**
   - ChecklistPanel 호출(L1934 부근)에 `preparedContext={currentPreparedContext}` 1줄 추가
   - `currentPreparedContext` 상태는 기존 L132에 이미 존재 — 새 fetch/state 추가 없음

3. **`frontend/src/screens/PrepareScreen.tsx`**
   - `startTbm` 내부 `putSession` 직전(L441 부근)에 `nextPriorInfo` 계산 블록 신설
   - 규칙: `latest.prior_info.workContentDetails`가 falsy + `selectedWorkTypeLabel`이 존재 시에만 `{ workContentDetails: selectedWorkTypeLabel }`을 spread. 그 외엔 `latest.prior_info` 그대로
   - `putSession` 호출에 `prior_info: nextPriorInfo` 라인 추가

4. **`backend/src/main.py`**
   - L26 `return {"status": "ok", "version": "0.2.4"}` → `"0.2.9"` (stale 문자열 정리)

## 산출물 문서

- `_workspace/feedback_2026-05-14_pr1_delivery.md` (본 문서)
- `_workspace/feedback_2026-05-14_phase_a_trace.md` (입력 — Phase A 진단)
- `_workspace/feedback_2026-05-14_pr_plan.md` (입력 — PR 명세)

---

## 변경 요약 (의미)

- ChecklistPanel 사전정보 박스의 "작업자수" 행이 priorInfo 슬롯 + preparedContext fallback 양쪽을 보도록 확장 → PrepareContextForm에 입력된 worker_count가 ChecklistPanel에 즉시 노출
- PrepareScreen이 작업유형 선택값(work_type_label)을 prior_info.workContentDetails로 1회 hydration mirror → 신규 세션 RunScreen 진입 즉시 "작업내용" 행 표시. LLM이 이후 더 구체적인 값을 update하면 그 값이 보존됨(mirror가 기존 값을 덮지 않음)
- backend health 엔드포인트의 응답 version 문자열을 실제 release tag(0.2.9)와 일치시킴

## 후방 호환성

- 데이터 모델/IndexedDB 스키마: 변경 0 (v3 유지)
- PreparedContext / PriorInformationRecord / Session: 변경 0
- backend prompt.py / llm.py / `[Slot Status]` block: 변경 0
- LLM tool 시그니처(collect_prior_information 외): 변경 0
- ChecklistPanel 외부 호출자: VoiceShell 단 1곳(grep 확인). `preparedContext` 옵셔널이라 미전달 시 기존 동작
- legacy 세션(prior_info에 LLM이 채운 값 + prepared_context 없음): fallback 안 타고 priorInfo만 표시 → 동작 100% 동등

## 회귀 리스크

1. **`numberOfWorkers === 0` 표시** — 사용자 결정으로 falsy 분기 유지. 0은 양쪽 모두 "미입력"으로 표시 (기존 동작 100% 동등). 명세에서 권고한 `!== undefined` 강화는 채택 안 함.
2. **work_type_label mirror 후 의미 충돌** — `prior_info.workContentDetails`에 "고소 작업" 같은 카테고리 라벨이 들어가는데, 사용자가 LLM에 더 구체적인 작업내용(예: "30층 외벽 도장")을 발화하면 LLM이 collect_prior_information로 update해 카테고리 라벨이 덮임. LLM이 이미 채워진 슬롯을 또 묻지 않으면 카테고리 라벨이 남음 — 다소 거친 정보지만 PR-1 목표(가시성 회복)에 부합. PR-2(v0.3.0)에서 PrepareContextForm에 workContentDetails 필드 직접 추가하면 자연 해소.
3. **재진입 시 work_type 변경 후 mirror 안 함** — Prepare → Run → "뒤로" → 작업유형 변경 → startTbm 재호출 시 `latest.prior_info.workContentDetails`에 이전 mirror 값이 영속된 상태이면 새 work_type_label로 덮지 않음(보수적 안전). 사용자가 LLM에 다시 말해야 update. 의도적 동작.
4. **PrepareScreen 진입 후 work_type 미선택으로 startTbm 호출** — L411 `if (!session || !selectedWorkTypeId) return;` 가드로 차단됨. mirror 코드 안 탐.
5. **다른 화면(예: HistoryScreen)에서 ChecklistPanel 호출** — grep 확인 결과 VoiceShell 1곳만. props 옵셔널이라 추가해도 안전.

---

## 빌드 결과

```
> frontend@0.2.4 build
> tsc -b && vite build

[sync-catalog] OK — 4 catalog file(s) synced
vite v7.0.0 building for production...
✓ 321 modules transformed.
✓ built in 4.07s
```

- tsc strict 통과 (PreparedContext import 타입 통과, 옵셔널 props 통과)
- vite build 통과 (321 modules)
- 신규 경고 0건 (chunk-size 경고는 v0.2.8 시점부터 존재하는 기존 경고)
- 빌드 산출물 사이즈: dist/assets/index-COCzvtsf.js 1,588.03 kB / gzip 644.28 kB (v0.2.8 대비 미세 증가, 영향 없음)

## backend import 검증

미수행 (환경에 Python 인터프리터 가용 여부 미확인, 변경이 문자열 1건이라 import 영향 없음). Railway 배포 후 `/api/health` 응답에서 `"version": "0.2.9"` 확인 가능.

---

## 수동 검증 시나리오 (Railway 배포 후 사용자 수행 예정)

명세 §PR-1 §빌드/스모크 테스트의 S1–S4 그대로:

- **S1 (가시성 회복)**: 신규 TBM 세션 — 도메인=제조, 작업유형="고소작업", "오늘의 현장 정보"에 작업자 수=5 입력 → "TBM 시작" → RunScreen → ChecklistPanel(우상단 작업현황 토글) → "사전 정보" 박스에서 "작업자수: 5명", "작업내용: 고소 작업" 표시 확인. workLocation/equipmentDetails는 "미입력" 유지.
- **S2 (LLM update 우선)**: S1 흐름 + LLM에 "오늘은 옥상에서 안테나 교체합니다, 작업자는 3명, 사다리 사용합니다" 발화 → collect_prior_information으로 workLocation="옥상", workContentDetails="안테나 교체", numberOfWorkers=3, equipmentDetails="사다리" update → ChecklistPanel 새로고침 시 LLM update 값이 표시(작업자수는 priorInfo.numberOfWorkers=3 우선이라 "3명").
- **S3 (0 처리 회귀)**: Prepare에 작업자 수=0 입력 → RunScreen 진입 → "작업자수: 미입력" 표시 확인 (falsy 분기 유지, 사용자 결정).
- **S4 (legacy 세션 동등성)**: IndexedDB v2/v3 기존 세션(prior_info에 LLM이 채운 값 + prepared_context 미존재) hydrate → 동작 100% 동등. fallback 안 타고 priorInfo만 표시.

추가로 사용자 검증 권장:

- `/api/health` 호출 시 `"version": "0.2.9"` 응답 확인 (Railway 배포 직후).

---

## 다음 cycle (PR-2 v0.3.0)

- PrepareContextForm에 workLocation/workContentDetails/equipmentDetails 3 필드 추가
- 5 언어 i18n 라벨 사전 (`PrepareFormLabels`)
- `new_material` 라벨 "신규/특이 자재 또는 공정"으로 정리
- PrepareScreen.startTbm이 4 슬롯(workLocation/workContentDetails/numberOfWorkers/equipmentDetails) prior_info hydration mirror (PR-1 mirror 코드 base)
- ChecklistPanel preparedContext fallback 코드는 그대로 유지 (worker_count 정합성)

명세는 `_workspace/feedback_2026-05-14_pr_plan.md` §PR-2 그대로 진행 가능.
