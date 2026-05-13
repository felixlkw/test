# PR-2 Delivery — Prepare 폼 사전정보 superset 확장 (v0.2.9 → v0.3.0)

**일자**: 2026-05-14
**범위**: PR-2 (B-1 방향 — superset 확장)
**선행 PR**: PR-1 (v0.2.8 → v0.2.9, 가시성 quick fix — `worker_count` fallback + `work_type_label → workContentDetails` mirror)

## TL;DR

테스터 피드백 PR-feedback-5의 본 해법(superset 확장)을 적용. `PrepareContextForm`이 사전정보 영속 4 슬롯 중 3 필드(workLocation / workContentDetails / equipmentDetails)를 Prepare 단계에서 직접 입력받도록 확장. worker_count는 기존 키 유지하고 `numberOfWorkers`로 mirror. 라벨은 컴포넌트 사상 처음으로 5언어(ko/en/vi/th/id) 분기. backend / `[Slot Status]` block / `collect_prior_information` tool / `PriorInformationRecord` / `useSlotProgress.ALL_SLOTS` / IndexedDB DB_VERSION 전부 변경 0. 후방호환 100%.

## 변경 파일 (4)

| 파일 | 변경 요약 | LOC ± |
|---|---|---|
| `frontend/src/components/PrepareContextForm.tsx` | `PrepareContextFormValue` 인터페이스 신설(export), `LABELS` 5언어 사전 신설(export), fieldset 3 신규 필드(workLocation / workContentDetails / equipmentDetails), `new_material` 라벨 변경, filledCount 9 필드, 모든 라벨 5언어 분기 | +179 / -27 |
| `frontend/src/screens/PrepareScreen.tsx` | `PrepareContextFormValue` import, `context` state 타입 확장, `contextPayload` useMemo가 PreparedContext 6 필드만 추출, 신규 hydration useEffect, `nextPriorInfo` → `mergedPriorInfo`(4 슬롯 hydration) | +60 / -13 |
| `backend/src/main.py` | `/api/health` version `"0.2.9"` → `"0.3.0"` | +1 / -1 |
| `_workspace/feedback_2026-05-14_pr2_delivery.md` | 본 문서 | 신규 |

총 LOC 변동: **+240 / -41** (PR-2만). PR-1과 합산 시 +270 / -45.

## 변경 요약 (영속/Behavior)

1. **PrepareContextFormValue** — `PreparedContext` + 3 옵셔널 transient 필드(workLocation / workContentDetails / equipmentDetails). 영속 스키마는 무변경. transient 슬롯은 `contextPayload` memo에서 제외되어 `prepared_context`로 영속되지 않음. 대신 `startTbm`에서 `prior_info` 4 슬롯으로 hydration mirror.
2. **5언어 LABELS 사전** — 본 컴포넌트의 첫 다국어 분기. ko / en / vi / th / id 5언어 × 16 라벨 키 = 80 문자열 + shift_options 5 × 5언어 = 25 추가. 한국어 모국 화자 시각의 번역으로 데모 단계 합리적 수준이며, native 검수는 향후 cycle 권장.
3. **mergedPriorInfo 슬롯별 우선순위(높음 → 낮음)**:
   - workLocation: LLM > form
   - workContentDetails: LLM > form > work_type_label (PR-1 fallback 유지)
   - numberOfWorkers: LLM > form.worker_count (key mirror; 0=falsy=미입력)
   - equipmentDetails: LLM > form
   - 규칙: prior_info에 이미 LLM이 채운 값이 있으면 form 값으로 덮어쓰지 않음(보수적 mirror).
4. **filledCount 9 필드** — 사용자 결정 룰: `worker_count`는 truthy 카운트(0=미입력), `wind_speed_mps`는 `!== undefined`(0=무풍 실값).
5. **new_material 라벨** — "신규 자재 / 공정" → "신규/특이 자재 또는 공정"(ko). 필드 키 `new_material`은 유지하여 기존 영속 데이터 호환.
6. **Prepare 재진입 hydration** — 신규 useEffect로 session 로드 시 1회: prepared_context 6 필드 + prior_info 3 슬롯 + worker_count(prepared_context > prior_info.numberOfWorkers 폴백)를 form value로 setContext. 사용자가 Prepare로 돌아오면 이전 입력이 그대로 표시. 확신 못함: 기존 hydration 패턴 없음(grep 확인) → 신규 분기. 미래에 통합 hydration useEffect가 생기면 본 블록 이관 권장.

## 9 신규/변경 필드 (PrepareContextForm fieldset)

순서대로:

| 순서 | 필드 키 | 한국어 라벨 | 영속 위치 | filledCount 룰 |
|---|---|---|---|---|
| 1 | `workLocation` (신규) | 작업장소 | prior_info.workLocation | truthy |
| 2 | `workContentDetails` (신규) | 작업내용 | prior_info.workContentDetails | truthy |
| 3 | `worker_count` (기존) | 작업자 수 | prepared_context.worker_count + prior_info.numberOfWorkers mirror | truthy (0=미입력) |
| 4 | `shift` (기존) | 교대 | prepared_context.shift | truthy |
| 5 | `equipmentDetails` (신규) | 장비정보 | prior_info.equipmentDetails | truthy |
| 6 | `wind_speed_mps` (기존, 옥외만) | 풍속 (m/s) | prepared_context.wind_speed_mps | `!== undefined` (0=무풍) |
| 7 | `new_material` (기존, 라벨 변경) | 신규/특이 자재 또는 공정 | prepared_context.new_material | truthy |
| 8 | `special_notes` (기존) | 특이사항 | prepared_context.special_notes | truthy |
| 9 | `previous_incident_keywords` (기존) | 과거 사고 키워드 | prepared_context.previous_incident_keywords | length > 0 |

## 5언어 라벨 추가 키 (요약 — 자세한 표는 명세 L382-509)

신규 3 (각 5언어):
- `work_location` — ko 작업장소 / en Work location / vi Vị trí làm việc / th สถานที่ทำงาน / id Lokasi kerja
- `work_content_details` — ko 작업내용 / en Work details / vi Nội dung công việc / th เนื้อหางาน / id Rincian pekerjaan
- `equipment_details` — ko 장비정보 / en Equipment / vi Thiết bị / th อุปกรณ์ / id Peralatan

기존 키도 모두 5언어로 분기됨 (이전 한국어 고정 → 다국어). 라벨 키 16개 × 5언어 = 80 + 교대 옵션 25 = 105 라벨 문자열 추가.

## 회귀 리스크 / 완화

| 리스크 | 영향도 | 완화 |
|---|---|---|
| LABELS 다국어 도입으로 한국어 사용자 화면 미세 변경 | 낮음 | new_material 라벨만 정리, 기존 한국어 8개 라벨은 동일 문자열 유지 |
| form 빈 입력으로 prior_info 영속본 지워짐 | 회피됨 | mergedPriorInfo merge 규칙: prior_info 값 있으면 덮어쓰지 않음 |
| LLM이 슬롯 또 묻는 사례 | 낮음 (검증 필요) | `[Slot Status]` block 작동 가정. S4 시나리오에서 검증. 회귀 시 후속 PR로 prompt 보강 |
| PDF에서 prepared_context.worker_count + prior_info.numberOfWorkers 중복 표시 | 낮음 | 신규 세션은 startTbm에서 동기화되어 동일 값. legacy는 prepared_context만 있을 가능성 — 시각적 중복은 미세 |
| 영구 hydration 패턴 신설 — 통합 useEffect 없음 | 낮음 | 신규 useEffect는 session?.session_id 의존성만 가지므로 안전. 향후 다른 form state 추가 시 통합 권장 |
| 번역 자연성(vi/th/id) | 낮음 | 한국어 모국 화자 시각 번역 — 데모 단계 OK, 향후 native 검수 권장 |

## 빌드 / 타입체크 결과

```
npm run build (tsc -b + vite build)
✅ 통과
- 321 modules transformed
- 빌드 시간: 3.82s
- 에러 0건
- 새 경고 0건 (기존 chunk size warning은 PR-2 이전부터 동일)
- prebuild sync-catalog: 4 도메인 정상
```

## 시나리오 검증 (수동 스모크 가이드 — 명세 L846-853)

| ID | 케이스 | 기대 동작 |
|---|---|---|
| S1 | 신규 TBM 세션, Prepare 폼에 5 필드 입력(workLocation/workContentDetails/worker_count/equipmentDetails/special_notes) → 시작 | RunScreen ChecklistPanel "사전 정보" 4 행 모두 채워진 상태 |
| S2 | S1 후 LLM에 "장비 추가로 가스측정기도 들고 갑니다" 발화 | collect_prior_information.equipment_details update → form 값 덮음 (LLM 우선순위 1) |
| S3 | form 일부만 채우고 시작(workLocation만) | RunScreen "작업장소: A동 옥상", 나머지 "미입력". LLM이 음성 첫 발화에서 missing 슬롯 인지 |
| S4 | form 모두 채우고 시작 | LLM이 슬롯 질문 회피(`[Slot Status]` 작동). 회피 안 하면 후속 PR prompt 보강 필요 |
| S5 | legacy 세션(prior_info에 LLM 값 + prepared_context 없음) hydrate | Prepare 재진입 시 form value가 prior_info 값으로 표시. startTbm 후 prior_info 유지 |
| S6 | workLocation 채우고 시작 → 뒤로가기 → 지우고 다시 시작 | prior_info.workLocation은 LLM update 우선이라 form 빈 입력으로 덮지 않음 (보수적 mirror) |
| S7 | 한국어 외 언어(en/vi/th/id) | Prepare 폼 라벨 전체가 해당 언어로 표시 |
| S8 | legacy 세션(new_material에 "테스트" 영속) hydrate | 라벨 "신규/특이 자재 또는 공정"으로 변경된 채 값 "테스트" 보존 |

## PR-1 → PR-2 누적 변경 요약

| 항목 | PR-1 (v0.2.9) | PR-2 (v0.3.0) |
|---|---|---|
| ChecklistPanel 사전정보 worker_count fallback | 추가 | 유지 |
| VoiceShell preparedContext prop drilling | 추가 | 유지 |
| PrepareScreen.startTbm work_type_label → workContentDetails mirror | 추가 | mergedPriorInfo 안에 우선순위 3순위로 통합 |
| PrepareContextForm 3 신규 필드 | — | 추가 |
| PrepareContextForm 5언어 LABELS | — | 추가 |
| PrepareContextForm filledCount 9 필드 | — | 변경 |
| new_material 라벨 정리 | — | 변경 |
| PrepareScreen context state 타입 확장 | — | 변경 |
| PrepareScreen contextPayload PreparedContext 6 필드만 추출 | — | 변경 |
| PrepareScreen Prepare 재진입 hydration useEffect | — | 추가 |
| PrepareScreen mergedPriorInfo 4 슬롯 mirror | (1 슬롯만) | 4 슬롯 확장 |
| backend /api/health version | — | "0.3.0" |

총 변경 파일: PR-1 = 3 + PR-2 = 4 = **누적 5개 파일 변경** (delivery 문서 제외).

## 영속 / 데이터 모델 / IndexedDB

| 항목 | PR-2 변경 |
|---|---|
| `Session.prior_info: PriorInformationRecord` | 0 (4 필드 옵셔널 그대로) |
| `Session.prepared_context: PreparedContext` | 0 (6 필드 옵셔널 그대로) |
| IndexedDB DB_VERSION | 유지 (v3) |
| backend `[Slot Status]` block | 0 |
| backend `collect_prior_information` tool 시그니처 | 0 |
| backend prompt.py | 0 |
| backend llm.py | 0 |
| useSlotProgress.ALL_SLOTS | 0 |

후방호환: 100%. 기존 v3 세션 fixture는 그대로 동작.

## 미해결 / 후속

- SummaryDrawer 사전정보 표시 코드 — Phase A §8 미확인. PR-2 후 후속 cycle에서 SummaryDrawer가 prior_info만 보는지 prepared_context도 보는지 확인 필요.
- LLM이 채워진 슬롯을 또 묻는 사례 — S4 시나리오 검증 결과에 따라 후속 prompt 보강.
- vi / th / id 번역 native 검수 — 별도 cycle 권장.
- App.tsx 분해 등 명세 외 리팩토링은 PR-2 범위 외(원칙 준수).
