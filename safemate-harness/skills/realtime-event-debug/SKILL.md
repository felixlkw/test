---
name: realtime-event-debug
description: OpenAI Realtime API(WebRTC) 이벤트 회귀 디버깅 절차. 자동 인사·말풍선·자동 발화·STT 정확도가 갑자기 안 될 때 사용. realtime-voice-engineer 가 회귀 디버깅 진입 시 자동 참조.
---

# Realtime 이벤트 회귀 디버깅 절차

## 0. 회귀 확인 (60초)

```sh
git log --oneline -20 -- backend/src/llm.py frontend/src/services frontend/src/App.tsx
```

마지막 정상 동작 커밋 ↔ 현재 사이의 diff 확인.

## 1. GA vs Beta 이벤트명 매핑 (가장 흔한 회귀 원인)

| 동작 | GA 이벤트 | Beta(과거) 이벤트 |
|---|---|---|
| 자동 인사 트리거 | `response.create` | `conversation.item.create` + `response.create` |
| 사용자 발화 자막 | `conversation.item.input_audio_transcription.completed` | `input_audio_transcription.completed` |
| LLM 응답 자막 (delta) | `response.output_audio_transcript.delta` | `response.audio_transcript.delta` |
| 응답 완료 | `response.done` | `response.done` (동일) |
| 오디오 청크 | `response.output_audio.delta` | `response.audio.delta` |

→ 이벤트 핸들러에서 위 이름 매핑이 어긋나면 즉시 회귀.

## 2. instructions 진단

```sh
grep -n "instructions" backend/src/llm.py
```

- instructions 안에 명시 언어 키워드 들어있는가? (e.g., "Respond in Korean.")
- tools 스키마와 prompt.py의 도메인 툴 정의가 일치하는가?
- noise_reduction / VAD threshold 값이 도메인별로 분기되어 있는가?

## 3. WebRTC peer 상태

브라우저 콘솔에서:
- `RTCPeerConnection.connectionState` = "connected" 인지
- audio track의 `enabled`, `muted` 상태
- ICE 연결 실패 시 STUN/TURN 서버 설정 확인

## 4. ephemeral key 발급 검증

```sh
curl -X POST $APP_URL/api/webrtc-key -H "Content-Type: application/json" -d '{"language":"korean","domain":"construction"}'
```

응답에 `client_secret.value` 포함, expiry 1분 이상이어야 정상.

## 5. STT 정확도 회귀

- glossary 부스팅 적용 여부: `backend/src/llm.py` 의 `load_glossary_snippet(domain, language)` 호출 확인
- VAD threshold 너무 높으면 짧은 발화 누락 — 0.5 기본, 시끄러운 환경 0.6~0.7
- noise_reduction 너무 강하면 자음 손실 — `near_field` 권장

## 출력

- 회귀 원인 후보 우선순위 (1~3)
- 의심 파일·행 번호
- 권장 수정안
- 회귀 방지 watch list
