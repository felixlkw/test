---
name: mockup-schema
description: 호반·대한전선 목업 카탈로그 JSON 스키마 정의·검증·승격 절차. safety-mockup-generator 가 생성 시 사용, critic 이 검수 시 참조, tbm-flow-engineer 가 정식 카탈로그로 승격 시 사용.
---

# 목업 카탈로그 스키마

## 출력 위치

- 작업 중: `backend/data/mockup_hoban/<company>.json` (회사별 통합)
- 또는: `backend/data/mockup_hoban/<company>/<WORK_TYPE>.json` (work_type 단위 분리)
- 정식 승격: `backend/data/checklist_catalog/<domain>.json` 으로 이동

## 스키마 (기존 카탈로그와 정합)

```json
{
  "domain": "construction | manufacturing | heavy_industry | semiconductor",
  "company": "hoban_construction | daehan_cable | hoban_resort | daehan_shipbuilding",
  "version": "0.X.Y-mockup",
  "note": "...",
  "work_types": {
    "<WORK_TYPE_CODE>": {
      "label_ko": "...",
      "label_en": "...",
      "label_vi": "...",
      "label_th": "...",
      "label_id": "...",
      "baseline": [ <BaselineItem>, ... ]
    }
  }
}
```

### BaselineItem

```json
{
  "id": "<CODE>-NN",
  "content": "한국어 점검항목 (필수)",
  "content_en": "...",
  "content_vi": "...",
  "content_th": "...",
  "content_id": "...",
  "regulation": "산업안전보건기준규칙 §XX (...)",
  "evidence_required": "photo | verbal | measurement",
  "scenarios": [ <Scenario>, ... ],
  "mitigations": [ <Mitigation>, ... ],
  "ppe": [ <PPE>, ... ]
}
```

### Scenario / Mitigation / PPE (구조 동일)

```json
{
  "id": "<CODE>-NN-SC-N",   // 또는 -MIT-N, -PPE-N
  "content": "...",
  "content_en": "...",
  "content_vi": "...",
  "content_th": "...",
  "content_id": "..."
}
```

## 수량 가이드

| 단위 | 권장 | 최소 | 최대 |
|---|---|---|---|
| work_type 당 baseline | 4~6 | 3 | 8 |
| baseline 당 scenario | 2~3 | 2 | 4 |
| baseline 당 mitigation | 2~3 | 2 | 5 |
| baseline 당 ppe | 1~2 | 1 | 3 |

너무 많으면 음성 대화 시 흐름이 너무 길어지고 prompt 토큰 부담. 너무 적으면 안전 커버리지 부족.

## ID 명명 규칙

- baseline: `<WORK_TYPE_PREFIX>-NN` (예: `APT_RC-01`, `XLPE-01`)
- scenario: `<baseline_id>-SC-N` (예: `APT_RC-01-SC-1`)
- mitigation: `<baseline_id>-MIT-N`
- ppe: `<baseline_id>-PPE-N`

prefix 는 work_type code를 적당히 축약 (예: `APT_RC_BUILD` → `APT_RC`).

## 검증 명령

```sh
# JSON 문법
jq empty backend/data/mockup_hoban/<file>.json

# 빈 다국어 필드 스캔
jq '.work_types[].baseline[] | select(.content_vi == null or .content_vi == "")' \
   backend/data/mockup_hoban/<file>.json

# baseline 수량
jq '.work_types | to_entries[] | {wt: .key, count: (.value.baseline | length)}' \
   backend/data/mockup_hoban/<file>.json

# scenario·mitigation·ppe 수량 분포
jq '.work_types[].baseline[] | {id, sc: (.scenarios|length), mit:(.mitigations|length), ppe:(.ppe|length)}' \
   backend/data/mockup_hoban/<file>.json
```

## 승격 절차 (목업 → 정식)

1. critic 으로 사실관계·다국어·스키마 검수.
2. 안전관리 담당자 검수 (사용자 외부 위임).
3. `mockup_hoban/<file>.json` 의 `work_types` 를 기존 `checklist_catalog/<domain>.json` 의 `work_types` 에 머지.
4. `version` 필드를 정식 버전으로 변경 (예: `0.5.0` — `-mockup` 접미사 제거).
5. `scripts/sync-catalog.mjs` 가 frontend 미러링 자동 처리.
6. tenant 매핑 확인 (해당 work_type 이 사용자 UI에서 보이는지).

## 흔한 실수

- `id` 명명 일관성 깨짐 — prefix 다른 baseline 간 섞임.
- `evidence_required` 가 enum 외 값 (`yes`, `O` 등) — `photo|verbal|measurement` 중 하나만.
- `regulation` 누락 — 안전 카탈로그의 핵심.
- 다국어 5종 중 한두 개 누락 — i18n-5lang skill 로 보완.
- `scenarios` 가 단일 위험만 — 외국인 노동자·기상·교대 다양성 누락.

## 출력

- 생성된 work_type · baseline 개수.
- 검증 통과 여부 (스키마·다국어·수량).
- 승격 권고 또는 추가 보완 영역.
