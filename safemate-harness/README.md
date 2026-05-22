# safemate-harness

SafeMate(SafeAssist) 멀티-PoC 프로젝트용 전문가 에이전트 하네스 — Claude Code 플러그인.

## 무엇이 들어있나

| 종류 | 이름 | 역할 |
|---|---|---|
| Agent (dev) | `realtime-voice-engineer` | OpenAI Realtime/WebRTC/음성 흐름 |
| Agent (dev) | `tbm-flow-engineer` | TBM 세션 플로우·체크리스트·IndexedDB |
| Agent (dev) | `tenant-poc-engineer` | 멀티 테넌트·Railway·고객사 분리 |
| Agent (dev) | `i18n-content-engineer` | 5개 언어 콘텐츠·glossary STT 부스팅 |
| Agent (design) | `uiux-designer` | 음성 우선 인터랙션·산업현장 접근성·IA (읽기 전용) |
| Agent (design) | `web-designer` | Tailwind 토큰·테넌트 브랜드·로고·반응형 (편집 가능) |
| Agent (safety) | `industrial-safety-expert` | 산안기준규칙·KOSHA 일반 (읽기 전용) |
| Agent (safety) | `construction-safety-expert` | 건설 공종별 안전공학 (읽기 전용) |
| Agent (safety) | `electrical-safety-expert` | 케이블·HV·아크플래시 (읽기 전용) |
| Agent (analyst) | `hoban-construction-analyst` | 호반그룹 사업유형 분석 (읽기 전용) |
| Agent (analyst) | `daehan-cable-analyst` | 대한전선 공장·EPC 분석 (읽기 전용) |
| Agent (orchestrator) | `safety-mockup-generator` | 분석가+안전전문가 출력을 카탈로그 JSON으로 합성 |
| Agent (process) | `project-manager` | 다단계 이니셔티브 WBS·시퀀싱·데드라인·리스크 (PM, 위임만) |
| Agent (process) | `critic` | 산출물 사실관계·다국어·스키마·교차참조·stale 검수 |
| Skill | `harness` | 요청 유형별 에이전트 라우팅 가이드 |
| Skill | `realtime-event-debug` | OpenAI Realtime 회귀 디버깅 절차 |
| Skill | `railway-ops` | Railway CLI 일상 운영 명령 모음 |
| Skill | `tenant-add` | 새 PoC 테넌트 등록 6단계 체크리스트 |
| Skill | `i18n-5lang` | ko→en/vi/th/id 번역 절차 + 글자수 가이드 |
| Skill | `glossary-stt-entry` | STT 부스팅 어휘 작성 가이드 |
| Skill | `kosha-citation` | 한국 안전법령·KOSHA 인용 표준 형식 |
| Skill | `risk-assessment-5step` | 산안법 §36 위험성평가 5단계 프레임워크 |
| Skill | `business-verify` | 외부 기업·자회사 web search 검증 절차 |
| Skill | `wcag-industrial` | 산업현장 WCAG AAA 접근성 감사 |
| Skill | `tenant-brand-tokens` | Tailwind 토큰 테넌트별 분리 (런타임 CSS 변수) |
| Skill | `mockup-schema` | 목업 카탈로그 JSON 스키마·검증·승격 |
| Skill | `poc-readiness` | PoC 데모 8영역 게이트 점검 |
| Skill | `factcheck-entities` | 외부 entity 인용 L0~L3 등급 검증 |
| Command | `/harness` | 하네스 진입점 슬래시 명령 |

총 14 subagent + 14 skill(harness 포함) + 1 slash command.

## 설치 (이 repo의 self-marketplace 사용)

```
/plugin marketplace add /path/to/this-repo
/plugin install safemate-harness@safemate-marketplace
```

또는 직접 복사:

```sh
cp -r safemate-harness/agents/* ~/.claude/agents/   # 사용자 레벨
cp -r safemate-harness/skills/harness ~/.claude/skills/
cp safemate-harness/commands/harness.md ~/.claude/commands/
```

프로젝트 레벨로만 쓰려면 `safemate-harness/` 를 `.claude/` 안으로 복사.

## 사용

```
/harness 호반건설 아파트 RC 골조 안전 카탈로그 만들어줘
/harness 대한전선 동조괴 공정 위험 분석
/harness 그리팅이 영어로 안 나와
```

또는 명시적으로 특정 에이전트 호출:

```
Agent(subagent_type="safety-mockup-generator", prompt="...")
```

세부 라우팅 표 → `skills/harness/SKILL.md`.

## 호출 원칙

1. **독립적이면 병렬** — 단일 메시지에서 여러 `Agent` 호출.
2. **종속적이면 순차** — 한 결과가 다음 입력일 때.
3. **데이터 합성은 항상 `safety-mockup-generator` 경유** — work_type/baseline/scenarios가 들어가는 JSON 생성 시. 조회·자문성 질문은 분석가·전문가 직접 호출 OK.
4. **단일 에이전트로 충분하면 단일** — 과도한 분배는 컨텍스트 낭비.

## 도메인 경계 주의

- 해저·지중 케이블 포설은 **construction(양중·맨홀·기상) + electrical(활선·잔류전하·아크) 둘 다** 필요. mockup-generator가 두 전문가 모두 호출해야 한다.
- 조선소 블록은 construction-safety-expert 1차, 협소공간 가스는 industrial-safety-expert 협업.

## 산출물 위치 약속

- 목업 데이터: `backend/data/mockup_hoban/<company>/<WORK_TYPE>.json`
- 정식 운영 데이터로 승격 시: `backend/data/checklist_catalog/<domain>.json`
- Railway/테넌트 식별자: 메모리 `railway_projects.md` (단일 출처)

## 버전

- **0.3.0** — Critic + Project Manager 에이전트 추가, 13개 절차 skill 세분화 (realtime-event-debug, railway-ops, tenant-add, i18n-5lang, glossary-stt-entry, kosha-citation, risk-assessment-5step, business-verify, wcag-industrial, tenant-brand-tokens, mockup-schema, poc-readiness, factcheck-entities). 호출 원칙 #5·#6 추가 (PM 위임, Critic 검수 권장).
- 0.2.0 — UI/UX Designer + Web Designer 에이전트 추가.
- 0.1.0 — 초기 릴리즈 (호반·LG이노텍 PoC 대상, 10 subagent).
