import type { SVGProps } from "react";

/**
 * Line-art icons in PwC pictogram style:
 *  - 2px stroke, rounded line caps/joins
 *  - orange gradient stroke (light top-left → deep bottom-right)
 *  - outline only, no fills
 * Sized 24x24 by default; pass `size` to scale uniformly.
 */

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  title?: string;
  /** Apply PwC orange gradient stroke regardless of parent text color. */
  gradient?: boolean;
}

const GRAD_ID = "pwc-icon-grad";

function IconShell({
  size = 24,
  title,
  gradient,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {gradient && (
        <defs>
          <linearGradient id={GRAD_ID} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFB27A" />
            <stop offset="100%" stopColor="#E0301E" />
          </linearGradient>
        </defs>
      )}
      <g stroke={gradient ? `url(#${GRAD_ID})` : "currentColor"}>{children}</g>
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <IconShell {...props}>
      <polyline points="15 5 8 12 15 19" />
    </IconShell>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <IconShell {...props}>
      <polyline points="9 5 16 12 9 19" />
    </IconShell>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <IconShell {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="13 5 20 12 13 19" />
    </IconShell>
  );
}

export function IconClose(props: IconProps) {
  return (
    <IconShell {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </IconShell>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <IconShell {...props}>
      <polyline points="4 7 20 7" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </IconShell>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </IconShell>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.16.75.25 1.15.25H21a2 2 0 0 1 0 4h-.09c-.4 0-.79.09-1.15.25z" />
    </IconShell>
  );
}

export function IconMic(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </IconShell>
  );
}

export function IconDoc(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <polyline points="14 3 14 7 18 7" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </IconShell>
  );
}

export function IconClock(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </IconShell>
  );
}

export function IconShield(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <polyline points="8.5 12.5 11 15 16 10" />
    </IconShell>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <IconShell {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </IconShell>
  );
}

export function IconChat(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 5h16v11H8l-4 4z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </IconShell>
  );
}

export function IconHome(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </IconShell>
  );
}

// PR A: padlock — used to mark required baseline checklist items in PrepareScreen.
export function IconLock(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <line x1="12" y1="15" x2="12" y2="17" />
    </IconShell>
  );
}

// PR C — 카메라(InputDock 마이크 우측 / CameraCapture 모달).
// 사각형 body + 렌즈 원형 + 우상단 셔터 표지 line-art.
export function IconCamera(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </IconShell>
  );
}

// PR H — 사진 앨범/갤러리 아이콘. InputDock 카메라 버튼 우측 노출.
// 사진 프레임 + 산(landscape) + 태양(원) 모티프 line-art.
export function IconImage(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <polyline points="4 17 10 12 14 15 20 10" />
    </IconShell>
  );
}

// PR A 보강: 새로고침(다시 받기) — PrepareScreen 위험 추천 헤더에서 사용.
// 원형 화살표 2 segment + tip arrow.
export function IconRefresh(props: IconProps) {
  return (
    <IconShell {...props}>
      <path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
      <polyline points="20 4 20 9 15 9" />
      <path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
      <polyline points="4 20 4 15 9 15" />
    </IconShell>
  );
}
