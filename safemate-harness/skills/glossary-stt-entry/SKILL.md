---
name: glossary-stt-entry
description: STT 어휘 부스팅용 glossary 항목 작성 가이드. backend/data/glossary_by_domain.json 신규 추가/수정 시 사용. i18n-content-engineer 가 참조.
---

# STT Glossary 항목 작성 가이드

## 스키마

```json
{
  "term_ko": "프레스",
  "term_en": "press",
  "phonetic_hint": "프레스 — 금형/슬라이드 맥락",
  "synonyms": ["프레스기"],
  "language": "ko"
}
```

## 필드별 작성 원칙

### `term_ko`
- 산업현장에서 실제 사용하는 표현.
- 외래어는 한국어 음역 (라이트커튼, 컨베이어).
- 약어는 풀어서 + 약어 모두 (synonyms로 보완).

### `term_en`
- KOSHA/OSHA 공식 영문 표현 우선.
- 일반 명사이면 소문자, 약어이면 대문자(LOTO, IPA).
- 괄호로 부연 가능 (예: "chromate (Cr6+)").

### `phonetic_hint` (가장 중요)
- **80자 이내**. 길면 prompt 부하.
- 실제 STT 오인식 패턴 위주.
- 권장 패턴: `<정상발음> — <맥락 또는 혼동 주의 안내>`.
- 좋은 예: `"인터록 — '인터락'으로도 발음; 방호문 연동장치"`
- 나쁜 예: `"중요한 안전 장치로서 작업자를 보호하는..."` (설명만 길고 STT에 도움 안 됨)

### `synonyms`
- 같은 사물의 다른 표현. STT가 둘 다 인식하도록.
- 예: 비계 → ["시스템비계", "강관비계"]
- 비어있어도 OK (`[]`).

### `language`
- 항상 `"ko"` (한국어 세션 부스팅용).
- 영어 세션 부스팅이 필요하면 별도 항목으로 `"en"` 추가.

## 도메인별 항목 수

- 각 도메인(manufacturing/construction/heavy_industry/semiconductor): **20~28개** 유지.
- common (도메인 공통): **12개**.
- 중복(두 도메인에 모두 필요한 용어)은 common 으로 승격.

## 추가 절차

1. 해당 도메인 또는 common 배열 끝에 항목 추가.
2. JSON 문법 검증: `jq empty backend/data/glossary_by_domain.json`.
3. 항목 수 카운트 확인:
   ```sh
   jq '.domains | to_entries[] | {domain: .key, count: (.value | length)}' \
      backend/data/glossary_by_domain.json
   ```
4. 한국어 세션 시작 → STT가 실제로 부스팅 적용하는지 콘솔 확인 (instructions 말미 글로서리 스니펫 노출).

## 흔한 실수

- phonetic_hint 가 단순 설명문 — STT 부스팅에 도움 안 됨.
- 80자 초과 — 항목 다수면 토큰 누적.
- 동일 term 두 도메인에 중복 등록 — common 으로 옮길 것.
- term_en 누락 — phonetic_hint 의 영어 약어 매칭 실패.

## 출력

- 추가/변경된 도메인 + 항목 ID(term_ko).
- 도메인별 항목 수 변화.
- 누락·중복 발견 시 위치 명시.
