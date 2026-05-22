---
name: i18n-5lang
description: 한·영·베·태·인니 5개 언어 번역 절차. 카탈로그 JSON content/scenarios/mitigations/ppe 필드를 일괄 번역할 때 사용. i18n-content-engineer 와 safety-mockup-generator 가 참조.
---

# 5개 언어 번역 절차

## 대상 언어와 필드 매핑

| 언어 | 필드 접미사 | 비고 |
|---|---|---|
| 한국어 | `content` (없음) | 원본, 1차 작성 |
| 영어 | `content_en` | 산업현장 영어 — 기술 용어 우선 |
| 베트남어 | `content_vi` | 성조 마크(á à ả ã ạ 등) 유지 필수 |
| 태국어 | `content_th` | 자음 + 모음 + 성조 부호 일체 |
| 인도네시아어 | `content_id` | 표준 인도네시아어 (말레이어와 구분) |

## 번역 원칙

1. **한국어 원문 먼저** — content 한국어 작성 후 4개 언어 일괄.
2. **기술 용어 우선** — KOSHA 공식 영문 표현(예: harness, scaffold, LOTO) 사용.
3. **약어·고유명사 유지** — IPA, HF, MEWP 등 영문 약어는 그대로.
4. **짧고 명확한 문장** — 산업현장 작업자가 빠르게 이해. 부사·관용어 회피.
5. **베트남어 diacritics 절대 누락 금지** — 성조가 의미를 바꾼다.
6. **이모지·이모티콘 금지** — 산업안전 톤에 부적합.

## 글자수 가이드

| 언어 | 한국어 1자 대비 | 버튼 라벨 최대 |
|---|---|---|
| 영어 | 1.2배 | 12자 |
| 베트남어 | 1.4배 | 14자 |
| 태국어 | 1.6배 | 16자 |
| 인니어 | 1.3배 | 13자 |

→ uiux-designer 와 협업해 텍스트 확장 수용 가능한 레이아웃 확인.

## 검증

```sh
# 누락 필드 스캔
jq '.work_types[].baseline[] | select(.content_vi == null or .content_vi == "") | .id' \
   backend/data/checklist_catalog/<domain>.json

# scenarios·mitigations·ppe 도 동일하게 5개 언어 체크
jq '[..|objects|select(.content?)|select(.content_vi==null)]' <file>
```

## 흔한 실수

- 베트남어 dấu(성조) 누락 — copy-paste 시 일부 폰트에서 깨짐. UTF-8 보장 확인.
- 태국어 자모 분리 — 단어 사이 공백 없음, 줄바꿈 위치 주의.
- 인니어 외래어 처리 — "smartphone" 같은 영어는 그대로 두는 게 자연스러움.
- 영어를 미국식·영국식 혼용 — 산업안전은 영국식(BS, EN)이 한국에서 더 친숙.

## 출력

- 채워진 필드 개수 (언어별).
- 검증 통과 여부.
- diacritics·UTF-8 인코딩 이슈 발견 시 위치 명시.
