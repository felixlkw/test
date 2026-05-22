---
name: tenant-add
description: 새 고객사 PoC 테넌트를 끝부터 끝까지 추가하는 체크리스트. backend·frontend·Dockerfile·Railway·메모리 6단계. tenant-poc-engineer 가 새 PoC 등록 시 사용.
---

# 새 테넌트 추가 체크리스트

## 사전 정보 수집

- 테넌트 ID (lowercase snake_case): `hoban`, `lg_innotek` 형태
- 회사명: 한국어 정식 명칭
- 앱명: PoC 브랜드명 (예: SafeMate, Safety Vision)
- 도메인 라벨: 4개 도메인 한국어 표기 차이
- 숨김 도메인: 사업과 무관해서 UI에서 숨길 도메인
- 주조 색상·로고: web-designer 위임 예정

## 단계 1 — Backend 등록

`backend/src/tenant.py`:
```python
NEW_TENANT = TenantConfig(
    id="<id>",
    company_name="<회사명>",
    app_name="<앱명>",
    domain_labels={"manufacturing": "...", ...},
    hidden_domains=frozenset({...}),
    domain_context_overlay={...},  # 선택
)

TENANTS: dict[str, TenantConfig] = {
    ...,
    NEW_TENANT.id: NEW_TENANT,
}
```

## 단계 2 — Frontend 미러링

`frontend/src/shared/tenant/config.ts` 에 동일 형상으로 추가. `TENANTS` 레지스트리 동기화.

## 단계 3 — 브랜치 분리

```sh
git checkout main
git checkout -b client/<id-with-dashes>
```

## 단계 4 — Dockerfile 빌드 ARG

```dockerfile
FROM node:22-slim AS frontend-build
ARG VITE_TENANT_ID=<id>
ENV VITE_TENANT_ID=${VITE_TENANT_ID}
```

## 단계 5 — Railway 셋업

`railway-ops` skill 참조.

```sh
railway init --name <Project-Name>
railway add --service <id>-safemate --variables "TENANT_ID=<id>"
railway service <id>-safemate
railway domain --json
# OPENAI_API_KEY 는 사용자 직접 또는 dashboard
railway up --detach --ci
```

## 단계 6 — 메모리 갱신

`~/.claude/projects/<project>/memory/railway_projects.md` 에 새 행 추가:

| Tenant | Branch | Railway Project | Project ID | Service | Domain |

## 검증

- [ ] `curl https://<service>-production.up.railway.app/api/health` → 200
- [ ] `curl https://<service>-production.up.railway.app/static/` → SPA 로드
- [ ] 브라우저 접속 → 테넌트 회사명/앱명 노출 확인
- [ ] 숨김 도메인이 UI에 안 보이는지 확인
- [ ] critic 에이전트로 사실관계 검수 권장

## 출력

- 추가된 테넌트 ID·브랜치·Railway 프로젝트 ID·도메인.
- OPENAI_API_KEY 설정 안내 (사용자 직접 액션 필요).
- 다음 단계 (디자인 토큰 적용, 컨텐츠 카탈로그 작성 등).
