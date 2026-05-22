---
name: poc-readiness
description: 고객사 PoC 데모 직전 준비 상태 점검 체크리스트. 새 테넌트가 데모 가능한 상태인지 8개 영역(코드·배포·콘텐츠·디자인·음성·다국어·접근성·메모리) 검사. project-manager 가 D-N 점검 시 사용.
---

# PoC 데모 준비 점검 체크리스트

## 사용 시점

- D-7 이상 — 큰 그림 점검, 부족한 영역 작업 발주.
- D-3 — 미세 조정, 남은 P0 작업 집중.
- D-1 — 최종 게이트, no-go 결정 가능.

## 8개 영역

### 1. 코드 (Branch & Build)
- [ ] 테넌트 브랜치 (`client/<tenant>`) 최신 main 머지 또는 의도된 분기 유지
- [ ] 로컬 빌드 성공 (`cd frontend && npm run build`)
- [ ] 백엔드 의존성 OK (`cd backend && uv sync` 또는 `pip install`)

### 2. 배포 (Railway)
- [ ] Railway 프로젝트 별도 생성 (`railway list`)
- [ ] 도메인 활성 (`curl <domain>/api/health` → 200)
- [ ] `TENANT_ID` 환경변수 설정 — backend 가 default fallback 안 되는지 확인
- [ ] `OPENAI_API_KEY` 환경변수 설정
- [ ] 헬스체크 통과 (`/api/health`)
- [ ] SPA 로드 (`/static/` → 200)

### 3. 콘텐츠 (Catalog)
- [ ] 도메인별 work_types 최소 3개 이상
- [ ] 각 work_type 당 baseline 4~6개
- [ ] regulation 인용 완비 (critic 검수)
- [ ] mockup → 정식 승격 완료 (해당 시)

### 4. 디자인 (Visual)
- [ ] 테넌트 색·로고 적용 (`tenant-brand-tokens` skill)
- [ ] 다크 모드 동작 (선택)
- [ ] 모바일 세로 (390~430px) 정상
- [ ] WCAG AAA 컨트라스트 (`wcag-industrial` skill)

### 5. 음성 (Realtime Voice)
- [ ] 자동 인사 — 명시 언어로 발화
- [ ] 말풍선 표시 (사용자 발화 + LLM 응답)
- [ ] STT 정확도 — glossary 부스팅 적용 확인
- [ ] barge-in (사용자 끼어들기) 가능
- [ ] 음성 실패 시 텍스트 fallback

### 6. 다국어 (i18n)
- [ ] 카탈로그 5개 언어 완성 (ko/en/vi/th/id)
- [ ] glossary 도메인별 20~28개, common 12개
- [ ] 그리팅 언어 셀렉터 즉시 반영
- [ ] 외국인 작업자 가정 시나리오 포함

### 7. 접근성 (Accessibility)
- [ ] 터치 타겟 56dp 이상
- [ ] 색상 의존 정보 없음 (KOSHA 색채 + 아이콘·텍스트 병행)
- [ ] 키보드 내비게이션
- [ ] 스크린리더 호환
- [ ] 옥외 환경 가독성 (실기기 검증 권장)

### 8. 메모리·문서 (Memory)
- [ ] `railway_projects.md` 에 새 테넌트 행 추가
- [ ] 테넌트 ID·도메인·브랜치 식별자 일치
- [ ] CLAUDE.md 또는 README 업데이트 (해당 시)

## 출력 형식

```
## PoC Readiness — <tenant> — <YYYY-MM-DD> (D-<N>)

### 8개 영역 점검 결과

| 영역 | 통과/실패 | 비고 |
|---|---|---|
| 1. 코드 | ✅ / 🔴 / 🟡 | ... |
| 2. 배포 | ... | ... |
| ... | ... | ... |

### P0 (Demo 전 반드시 해결)
- ...

### P1 (Demo 도중 risk)
- ...

### Go/No-Go 결정 권고
- Go / No-Go / Go with caveats
- 근거: ...
```

## Go/No-Go 기준

- **Go**: 모든 P0 해결, P1 3개 이하
- **Go with caveats**: P0 해결, P1 4~6개 — 데모 스크립트로 회피
- **No-Go**: P0 1개 이상 — 데모 연기 또는 범위 축소

## 출력

- 영역별 점검 결과 + 증거 (curl 결과·grep 결과 등)
- P0/P1 분류된 이슈 목록
- Go/No-Go 권고 + 근거
