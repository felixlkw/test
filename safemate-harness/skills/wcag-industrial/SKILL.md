---
name: wcag-industrial
description: 산업현장 환경(옥외 강한 햇빛·장갑·소음·다국어·교대 근무)에 특화된 WCAG AAA 접근성 감사 절차. uiux-designer, web-designer 가 화면 검토 시 사용.
---

# 산업현장 WCAG AAA 감사

## 산업 환경의 특수성

일반 웹 WCAG AA 로는 부족 — 다음 환경 변수 가정:
- 옥외 강한 햇빛 (휘도 > 5000 cd/m²)
- 장갑 끼고 터치 (정전식 호환 장갑 가정도 손가락 정밀도 떨어짐)
- 소음 80~95 dB (음성 피드백 어려움)
- 외국인 작업자 다국적
- 야간 교대 근무 (망막 명순응)

## 감사 항목

### 1. 대비 (Contrast)
- **본문 텍스트**: 7:1 (AAA, 큰 텍스트 4.5:1)
- **버튼·아이콘**: 4.5:1 이상
- 검증: Chrome DevTools Accessibility → Contrast 또는 axe DevTools
- 옥외 가정 시 7:1 도 가독성 한계 — 가능하면 흰 배경 + 진한 텍스트 (#1E1E1E 이하)

### 2. 터치 타겟 (Touch Target Size)
- iOS HIG: 최소 44pt
- Material: 최소 48dp
- **산업현장 권장: 56dp (장갑 보정)**
- 인접 타겟 간격 최소 8dp

### 3. 색상 의존성 (Color Independence)
- 색상만으로 정보 전달 금지.
- 안전 정보(녹/황/적)는 항상 아이콘·텍스트·패턴 병행.
- KOSHA 색채 표준:
  - 적색 = 금지/위험/소화
  - 황색 = 주의/경고
  - 녹색 = 안전/지시/구급
  - 청색 = 정보/안내

### 4. 음성 UX (Voice Interaction)
- 마이크 활성 상태 시각 피드백 (파형·펄스).
- "듣는 중 / 생각 중 / 말하는 중" 3가지 상태 명시.
- 음성 인식 실패 시 텍스트 입력 fallback 1-tap 제공.
- TTS 재생 중 일시정지·재생 가능.

### 5. 키보드 내비게이션 (Keyboard Navigation)
- 모든 인터랙티브 요소 Tab 도달.
- focus indicator 명확 (2px solid outline, 색상 토큰).
- Skip-to-content 링크.
- 키보드 트랩 없음.

### 6. 스크린리더 (Screen Reader)
- 모든 의미 있는 이미지에 alt.
- 폼 요소에 label 또는 aria-label.
- 동적 콘텐츠 변경은 aria-live 영역에 통지.
- 음성 모드라도 시각 보조 기술 병행 가능하게.

### 7. 텍스트 확장 (Text Resize)
- 200% 확대 시 가로 스크롤 발생 없음.
- 다국어 텍스트 확장 (한국어 → 베트남어 1.4배) 시 레이아웃 깨짐 없음.
- 한 줄로 가정한 버튼이 2줄 되어도 잘림 없음.

### 8. 다크 모드 + 야간 적색 모드
- 다크 모드: 야간 작업 시 망막 보호.
- 적색 야간 모드 (옵션): 더 강한 명순응 유지 — 안전 정보 색채(녹/적)와 충돌 주의.

## 감사 실행

```sh
# Chrome DevTools Lighthouse → Accessibility
# 또는 axe-core CLI
npx @axe-core/cli http://localhost:5173/static/
```

수동 점검:
- 옥외 시뮬레이션: 모니터 밝기 최대 + 종이 위에 출력해서 햇빛 아래 확인
- 장갑 시뮬레이션: 정전식 장갑 끼고 모든 터치 타겟 조작
- 다국어 시뮬레이션: VITE_TENANT_ID로 베트남어 빌드 + 화면 점검

## 출력

- 항목별 통과/실패 (P0/P1/P2).
- 실패 항목의 화면·컴포넌트·행 번호.
- 권고 수정안 (CSS 토큰 변경, 컴포넌트 구조 변경 등).
- 추가 점검 필요 영역 (실기기·실환경 검증 필요).
