---
name: factcheck-entities
description: 외부 entity(법령 조문, 회사명, 자회사, 프로젝트명, API 이벤트명, 통계 수치) 인용 사실관계 검증 절차. critic 이 주로 사용, business-verify 와 보완 관계 (이쪽은 더 광범위).
---

# 외부 Entity 사실관계 검증

## 검증 대상 카테고리

| 카테고리 | 검증 출처 | 검증 빈도 |
|---|---|---|
| 한국 법령 조문 | 국가법령정보센터 (law.go.kr) | 개정 즉시 |
| KOSHA 가이드 | kosha.or.kr | 분기별 |
| 회사·자회사명 | DART, 공식 IR | 6개월 |
| 인수합병 사실 | 언론 (한겨레/연합/매경) | 즉시 |
| 통계 수치 | KOSHA·고용노동부 공시 | 연간 |
| API 이벤트명 | OpenAI/Anthropic 공식 changelog | 즉시 |
| 국제 표준 (IEC/IEEE/ISO) | 공식 표준 DB | 5년 |
| 단위·기준값 (LEL·전압·풍속) | KEC·KOSHA·IEEE | 5년 |

## 검증 강도 (Trust Levels)

- **L0 (확정)**: Primary 출처 직접 확인 + URL 명시.
- **L1 (강한 추정)**: Secondary 출처 (위키·언론) 2건 이상 일치.
- **L2 (약한 추정)**: 단일 secondary 출처.
- **L3 (미검증)**: 출처 없음, 추측성. → critic 이 P0 지적.

산출물에 인용 시:
- L0~L1 → 그대로 인용 + 출처 메모.
- L2 → "<출처 검증 필요>" 표시.
- L3 → 인용 금지 또는 삭제.

## 검증 절차

### 1. 법령·표준 조문 검증

```
WebSearch: "산업안전보건기준규칙 제42조"
또는 직접: https://law.go.kr 검색
```

확인 항목:
- 조문 번호 실재
- 조문 제목·키워드 일치
- 최근 개정일 (참조 시점과 차이)

### 2. 회사·자회사·M&A 검증

`business-verify` skill 참조. 추가:
- DART 공시 (상장사) — 사업보고서 ‘계열회사 등에 관한 사항’
- 공정거래위원회 기업집단포털 (대기업집단)

### 3. API·SDK 이벤트명 검증

```
WebFetch: https://platform.openai.com/docs/api-reference/realtime
또는 npm view @openai/agents@latest types
```

GA vs Beta 차이 — `realtime-event-debug` skill 참조.

### 4. 통계·수치 검증

- KOSHA 산업재해통계 (e-안전보건공단)
- 고용노동부 산업재해 발생 현황
- 인용 시 정확한 연도·범위 명시 ("2024년 건설업 사망사고 X건")

### 5. 단위·기준값 검증

- 한국전기설비규정(KEC) — 전기 이격거리·접지
- 산업안전보건기준규칙 별표 — 노출 한도(TLV, ppm)
- IEEE 1584 — 아크플래시 계산
- 풍속·강우 등 기상 게이트는 사이트 SOP 우선

## Stale 표지

다음 표현이 보이면 즉시 검증 또는 정정:
- "최근", "지금", "현재"
- "약 N%" 출처 없는 통계
- "<자회사명> 등(等)"
- "<API 명세 일부>" 인용 시점 명시 없음

## 출력

- 검증 항목별 L0~L3 등급
- L0~L1 항목은 출처 URL·검증 일자
- L2~L3 항목은 별도 표시 + 검증 권고
- 정정/삭제 권고가 있으면 명시
