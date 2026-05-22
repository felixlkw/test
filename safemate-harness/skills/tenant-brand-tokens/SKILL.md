---
name: tenant-brand-tokens
description: Tailwind 디자인 토큰을 테넌트별로 분리·스왑하는 절차. 현재 tailwind.config.js 의 pwc.* 토큰이 LG레드로 고정되어 있어 호반·기타 테넌트와 충돌 — 이 skill 이 분리 방법을 정의. web-designer 가 사용.
---

# 테넌트 브랜드 토큰 분리

## 현재 문제

`frontend/tailwind.config.js` 의 `pwc.*` 토큰 (예: `pwc.orange #A50034`) 이 **LG레드 계열로 하드코딩**. 호반·삼성·기타 테넌트 빌드 시에도 같은 색이 적용되어 브랜드 충돌.

## 접근 방법 비교

### A. CSS 변수 + data-tenant 속성 (런타임 스왑, 권장)
**장점**: 한 빌드로 여러 테넌트 지원 가능, 토글로 비교 쉬움.  
**단점**: SSR 첫 렌더에 깜빡임, CSS 변수 지원 필요 (모던 브라우저 OK).

```css
:root {
  --color-brand: #A50034;       /* 기본 (LG) */
  --color-brand-deep: #7A0026;
}
[data-tenant="hoban"] {
  --color-brand: #003B6F;       /* 호반 (가정) */
  --color-brand-deep: #002952;
}
[data-tenant="default"] {
  --color-brand: #1428A0;       /* Samsung */
  --color-brand-deep: #0E1C70;
}
```

```js
// tailwind.config.js
colors: {
  brand: 'var(--color-brand)',
  'brand-deep': 'var(--color-brand-deep)',
}
```

```tsx
// App.tsx 또는 main.tsx
document.documentElement.dataset.tenant = tenant.id;
```

### B. Vite 빌드 타임 분기 (현재 패턴 확장)
**장점**: 단일 테넌트 빌드 — CSS 작아짐.  
**단점**: 테넌트 추가 시 빌드 재실행 필요.

```js
// tailwind.config.js
const tenantTokens = require(`./src/shared/tenant/tokens/${process.env.VITE_TENANT_ID || 'default'}.cjs`);
module.exports = {
  theme: { extend: { colors: tenantTokens.colors } },
  ...
};
```

각 테넌트마다 `src/shared/tenant/tokens/<tenant>.cjs` 파일.

### C. SCSS 변수 + @use
프로젝트가 Tailwind 중심이라 비권장.

## 권장 절차

1. **A 방식 채택** (런타임 CSS 변수).
2. `frontend/src/shared/tenant/tokens.ts` 신설 — 테넌트별 색 매핑.
3. `frontend/src/index.css` 에 `:root` + `[data-tenant=...]` 블록 작성.
4. `tailwind.config.js` 의 `pwc.*` 토큰을 `brand.*` 로 rename 하면서 값을 `var(--color-brand)` 로 변경.
5. App 마운트 시점에 `document.documentElement.dataset.tenant = tenant.id`.
6. 컴포넌트의 `bg-pwc-orange` → `bg-brand` 일괄 치환 (codemod 또는 grep&replace).

## 의미 토큰 + 시맨틱 토큰 구조

```
브랜드 코어 (테넌트별 스왑):
  --color-brand
  --color-brand-deep
  --color-brand-soft

시맨틱 (모든 테넌트 공통):
  --color-success
  --color-warning
  --color-danger
  --color-info
  --color-neutral

서피스 (다크 모드 분기):
  --color-bg
  --color-bg-card
  --color-text
  --color-text-mute
  --color-border
```

## 로고

- `public/<tenant>-logo.svg` 명명 규칙.
- App.tsx 에서 `tenant.id` 로 분기하여 로드.
- SVG 안에서 색은 `currentColor` 또는 `fill="var(--color-brand)"` 로 작성하면 토큰 변경 시 자동 따라감.

## 검증

- 각 테넌트로 빌드/실행해서 시각 회귀 없는지 확인.
- 컨트라스트 (`wcag-industrial` skill) 재감사 — 새 브랜드 색 7:1 대비 유지 확인.
- 다크 모드 토글 시 가독성.

## 출력

- 변경된 토큰·CSS 변수 매핑 표.
- 영향받은 컴포넌트 목록 (grep 결과).
- 테넌트별 회귀 검증 체크리스트.
