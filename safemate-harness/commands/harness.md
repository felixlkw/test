---
name: harness
description: SafeMate 전문가 에이전트 하네스를 호출. 요청 유형(음성/TBM/테넌트/i18n/안전공학/호반그룹 분석/목업 합성) 에 따라 적절한 subagent로 자동 분배. 인자 없이 호출 시 사용자 메시지 컨텍스트로 라우팅 판단.
---

# /harness

SafeMate(SafeAssist) PoC 작업용 전문가 에이전트 하네스 진입점.

## 동작

사용자 요청을 분석해 `skills/harness/SKILL.md` 라우팅 표대로 적절한 subagent(들)에 작업을 위임한다. 결정 흐름:

1. **현재 요청을 라우팅 키워드와 매칭** — 음성/TBM/테넌트/다국어/안전(건설·전기·일반)/호반·대한전선 분석/목업 합성.
2. **단일 매칭이면 단일 호출** — `Agent` 도구로 해당 subagent 직접 호출.
3. **복수 매칭이면**:
   - 독립 작업 → 단일 메시지에서 `Agent` 도구 병렬 호출
   - 종속 작업 → 순차 호출 (한 결과를 다음 입력으로)
4. **데이터 합성 요청은 항상 `safety-mockup-generator` 단독** — 내부 분배 책임을 generator에 위임.

## 사용 예

- `/harness 호반건설 아파트 RC 골조 안전 카탈로그 만들어줘` → safety-mockup-generator
- `/harness 대한전선 동조괴 공정에 어떤 위험이 있어?` → electrical-safety-expert + daehan-cable-analyst 병렬
- `/harness 새 테넌트 추가하고 싶어` → tenant-poc-engineer
- `/harness 그리팅이 영어로 안 나와` → realtime-voice-engineer
- `/harness TBM 화면 사용성 검토해줘` → uiux-designer
- `/harness 호반 테넌트 색·로고 적용` → web-designer
- `/harness 새 설정 화면 디자인` → uiux-designer + web-designer 병렬
- `/harness 호반 데모 D-7 점검` → project-manager
- `/harness 방금 만든 카탈로그 검수해줘` → critic
- `/harness` (인자 없음) → 직전 사용자 메시지 컨텍스트로 라우팅 판단, 모호하면 짧게 확인

## 참고

세부 라우팅 표와 도메인 경계 메모는 `skills/harness/SKILL.md` 참조.
