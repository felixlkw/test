// PR-feedback-1 (v0.2.2) — 미완료 TBM 다건 관리 i18n 라벨.
// SafeMate i18n 컨벤션: per-string 함수 + SessionLanguage switch.
// (cueMessages.ts와 동일 패턴)
//
// HomeScreen·HistoryScreen은 현재 한국어 하드코딩 화면이지만, 팀 표준에 맞춰
// 5 언어를 모두 정의해 두고 호출부는 기본 "korean"으로 호출한다. 이후 외국인
// 리더용 화면 i18n 적용 시 로케일 selector만 바꾸면 된다.

import type { SessionLanguage } from "../../services/sessionModel";

/** "이어쓸 TBM {n}건" 카운트 배지. n >= 2 일 때만 표시. */
export function getDraftCountBadgeLabel(
  language: SessionLanguage,
  count: number,
): string {
  switch (language) {
    case "english":
      return `${count} draft TBM${count === 1 ? "" : "s"} to continue`;
    case "vietnamese":
      return `${count} TBM nháp cần tiếp tục`;
    case "thai":
      return `TBM ที่ค้างอยู่ ${count} รายการ`;
    case "indonesian":
      return `${count} TBM draft untuk dilanjutkan`;
    case "korean":
    default:
      return `이어쓸 TBM ${count}건`;
  }
}

/** HistoryScreen 세그먼트 — 전체. */
export function getHistoryFilterAllLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "All";
    case "vietnamese":
      return "Tất cả";
    case "thai":
      return "ทั้งหมด";
    case "indonesian":
      return "Semua";
    case "korean":
    default:
      return "전체";
  }
}

/** HistoryScreen 세그먼트 — 미완료(draft). */
export function getHistoryFilterDraftLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "In progress";
    case "vietnamese":
      return "Chưa hoàn tất";
    case "thai":
      return "ยังไม่เสร็จ";
    case "indonesian":
      return "Belum selesai";
    case "korean":
    default:
      return "미완료";
  }
}

/** HistoryScreen 세그먼트 — 완료(confirmed). */
export function getHistoryFilterCompletedLabel(
  language: SessionLanguage,
): string {
  switch (language) {
    case "english":
      return "Completed";
    case "vietnamese":
      return "Đã hoàn tất";
    case "thai":
      return "เสร็จแล้ว";
    case "indonesian":
      return "Selesai";
    case "korean":
    default:
      return "완료";
  }
}

/** HistoryScreen "더보기" 버튼. 페이지네이션 next page. */
export function getHistoryShowMoreLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "Show more";
    case "vietnamese":
      return "Xem thêm";
    case "thai":
      return "ดูเพิ่มเติม";
    case "indonesian":
      return "Tampilkan lebih banyak";
    case "korean":
    default:
      return "더보기";
  }
}

/** "이어쓰기" CTA — 미완료 항목 클릭 → TBM Run 화면. */
export function getHistoryContinueCtaLabel(
  language: SessionLanguage,
): string {
  switch (language) {
    case "english":
      return "Continue";
    case "vietnamese":
      return "Tiếp tục";
    case "thai":
      return "ดำเนินการต่อ";
    case "indonesian":
      return "Lanjutkan";
    case "korean":
    default:
      return "이어쓰기";
  }
}

/** 홈 빈 상태(미완료 0건) 메시지 — 기존 화면은 "현재 진행 중인 TBM이
 *  없습니다." 같은 카피를 별도로 두지 않는다(Resume Card 자체가 conditional
 *  렌더). 본 키는 향후 빈 상태 마이크로카피가 필요할 때를 대비한 placeholder. */
export function getHomeEmptyStateLabel(language: SessionLanguage): string {
  switch (language) {
    case "english":
      return "No TBM in progress";
    case "vietnamese":
      return "Không có TBM đang thực hiện";
    case "thai":
      return "ไม่มี TBM ที่กำลังดำเนินการ";
    case "indonesian":
      return "Tidak ada TBM yang berjalan";
    case "korean":
    default:
      return "진행 중인 TBM이 없습니다";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Relative time helper — HistoryScreen 항목 메타("3분 전" 등) 표시용.
// Intl.RelativeTimeFormat 기반 — Vite/모던 브라우저는 모두 지원.
// 실패(테스트 환경 등) 시 toLocaleString 폴백.
// ─────────────────────────────────────────────────────────────────────

const LANGUAGE_TO_LOCALE: Record<SessionLanguage, string> = {
  korean: "ko-KR",
  english: "en-US",
  vietnamese: "vi-VN",
  thai: "th-TH",
  indonesian: "id-ID",
};

/** ISO timestamp → "방금/3분 전/2시간 전/3일 전" 등 5언어 relative time. */
export function formatRelativeTime(
  iso: string,
  language: SessionLanguage = "korean",
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const locale = LANGUAGE_TO_LOCALE[language] ?? "ko-KR";

  if (typeof Intl === "undefined" || typeof Intl.RelativeTimeFormat === "undefined") {
    return then.toLocaleString(locale);
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (Math.abs(seconds) < 60) {
    return rtf.format(-seconds, "second");
  }
  if (Math.abs(minutes) < 60) {
    return rtf.format(-minutes, "minute");
  }
  if (Math.abs(hours) < 24) {
    return rtf.format(-hours, "hour");
  }
  if (Math.abs(days) < 7) {
    return rtf.format(-days, "day");
  }
  // 7일 이상은 절대 날짜로
  return then.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
