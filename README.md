# SafeAssist (SafeMate) v0.2.0

제조·건설·중공업·반도체 4개 산업 도메인을 지원하는 TBM + EHS 안전 Q&A 음성대화 앱.
OpenAI Realtime API(WebRTC) 기반 실시간 음성 대화, 도메인별 체크리스트·허가서·측정 로그 관리, 다국어(한·영·베·태·인니) 지원.

## 디렉토리 구조

```
./
├── backend/                 FastAPI + Python 3.12 (uv)
│   ├── src/
│   │   ├── main.py          FastAPI 앱 + 라우팅
│   │   ├── llm.py           OpenAI Realtime API 연동
│   │   └── prompt.py        도메인별 시스템 프롬프트 + 툴 스키마
│   ├── data/                가이드라인 JSON, 도메인 용어집
│   ├── pyproject.toml       Python 의존성
│   └── uv.lock
├── frontend/                React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx          메인 음성대화 컴포넌트
│   │   ├── Router.tsx       SPA 라우팅
│   │   ├── screens/         HomeScreen, TBMScreen, HistoryScreen, SettingsScreen
│   │   ├── services/        WebRTC, IndexedDB, 체크리스트 등
│   │   └── components/      UI 컴포넌트
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile               Multi-stage (Node + Python) Railway-ready
├── railway.json             Railway 배포 설정
├── Procfile                 Railway 프로세스 설정
├── .gitignore
└── README.md
```

## Railway 배포 가이드

### 1. 사전 요구사항
- [Railway](https://railway.app) 계정
- OpenAI API 키

### 2. Railway 배포

**방법 A: GitHub 연결 (권장)**
1. 이 저장소를 GitHub에 푸시
2. Railway에서 "New Project" → "Deploy from GitHub repo" 선택
3. 저장소 연결
4. 환경변수 설정:
   - `OPENAI_API_KEY` = `sk-your-key-here`
5. Railway가 자동으로 Dockerfile을 감지하여 빌드·배포

**방법 B: Railway CLI**
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 생성 및 배포
railway init
railway up

# 환경변수 설정
railway variables set OPENAI_API_KEY=sk-your-key-here
```

### 3. 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 |
| `PORT` | ❌ | Railway가 자동 설정 (기본 8000) |

### 4. 배포 확인
- Health check: `https://your-app.railway.app/api/health`
- 앱 접속: `https://your-app.railway.app/static/`

## 로컬 개발

### 빠른 실행

```bash
# 1. 환경 설정
cp backend/.env.example backend/.env
# backend/.env 에 OPENAI_API_KEY 입력

# 2. 백엔드 의존성 설치
cd backend && uv sync && cd ..

# 3. 프론트엔드 빌드
cd frontend && npm install && npm run build && cd ..

# 4. 서버 실행
cd backend && uv run uvicorn src.main:app --host 127.0.0.1 --port 8000
```

브라우저: **http://localhost:8000/static/**

### 개발 모드 (HMR)

```bash
# 터미널 1 — Backend
cd backend && uv run uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload

# 터미널 2 — Frontend (Vite)
cd frontend && npm run dev
```

브라우저: **http://localhost:5173/static/** (Vite가 `/api`를 `:8000`으로 프록시)

### Docker 로컬 빌드

```bash
docker build -t safeassist .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY=sk-your-key-here safeassist
```

## 주요 기능 (v0.2.0)

| 영역 | 내용 |
|---|---|
| **도메인** | manufacturing / construction / heavy_industry / semiconductor |
| **언어** | korean / english / vietnamese / thai / indonesian |
| **TBM 모드** | 음성 기반 사전정보 수집 → 동적 체크리스트 생성 → 순차 점검 → 8-필드 기록 → 최종 요약 |
| **EHS 모드** | 음성/텍스트 기반 안전 Q&A + 문서 검색 + 인용 표시 |
| **도메인 툴** | request_permit (허가서 요청), log_measurement (측정값 기록) |
| **STT** | 도메인별 noise_reduction + VAD threshold + 용어집 부스팅 |
| **저장소** | IndexedDB v2 (safemate/sessions) |

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | Health check |
| POST | `/api/webrtc-key` | OpenAI Realtime ephemeral key 발급 |
| POST | `/api/transcribe` | 음성→텍스트 변환 |
| POST | `/api/retrieve` | 쿼리 기반 문서 검색 |
| POST | `/api/retrieve-keywords` | 키워드 기반 문서 검색 |
| GET | `/static/*` | React SPA (프론트엔드) |

## 라이선스

내부 데모 프로젝트. OpenAI API 사용료는 사용자 부담.
