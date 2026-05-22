---
name: railway-ops
description: Railway CLI 일상 운영 절차 (인증·프로젝트·서비스·도메인·변수). tenant-poc-engineer 가 새 PoC 배포 또는 기존 배포 점검 시 사용.
---

# Railway CLI 운영 절차

## 인증

이 환경은 인터랙티브 터미널 미지원 → API 토큰 사용.

```sh
export RAILWAY_API_TOKEN=<token>
railway whoami    # felixlkw@naver.com 확인
```

토큰 발급: https://railway.app/account/tokens

## 프로젝트·서비스 식별자

메모리 파일 `railway_projects.md` 단일 출처. 새 테넌트 추가 시 메모리 갱신 필수.

## 자주 쓰는 명령

```sh
# 새 프로젝트 생성
railway init --name <Project-Name>

# 서비스 추가 + 변수 동시 설정
railway add --service <name> --variables "TENANT_ID=<id>" --json

# 서비스 link (현재 디렉토리에)
railway service <name>

# 도메인 생성 (자동, <service>-production.up.railway.app 패턴)
railway domain --json

# 변수 설정 (stdin으로 안전 주입)
echo "sk-..." | railway variable set OPENAI_API_KEY --stdin --service <name>

# 변수 목록 (값 마스킹 X — 출력 주의)
railway variables --service <name>

# 배포 (현재 디렉토리 → 서비스)
railway up --detach --ci

# 최근 배포 상태
railway deployment list --json | jq '.[0] | {id, status, createdAt}'

# 로그
railway logs --json --lines 100
```

## 도메인 패턴 주의

자동 생성 도메인은 항상 `<service>-<env>.up.railway.app`. 접미사 없는 URL 불가. 필요 시 커스텀 도메인 별도 구매 + CNAME.

## 빌드 실패 트리아지

```sh
railway logs --json --lines 200 | jq -r '.[] | select(.severity=="ERROR")'
```

흔한 원인:
1. Dockerfile `VITE_TENANT_ID` ARG vs ENV 혼동
2. `package.json` lockfile 누락 → `npm ci` 실패
3. backend `requirements.txt` 버전 충돌
4. healthcheck `/api/health` timeout (기본 120s)

## 보안

- API 토큰을 conversation log·git·환경 외 평문에 남기지 않는다.
- `railway variables` 출력은 raw value 포함 — 공유 금지.
- 다른 프로젝트의 OPENAI_API_KEY 등을 자동 복사하지 않는다 (사용자 명시 지시 시에만).
