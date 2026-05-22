// Phase 0.6 Wave 7 — i18n micro-copy for conversational TBM mode transitions.
//
// Mode chip labels + transition toast messages localized in 5 languages.
// Mirrors the digression keyword set documented in CONVERSATIONAL_TBM_TRANSITIONS_NOTICE
// (backend/src/prompt.py).
//
// Critic 검수: 마이크로카피가 LLM 응답과 충돌하지 않도록 시스템 톤 (간결·신뢰)
// 유지. 외국인 작업자 모국어 SOP 정합.

import type { SessionLanguage } from "../../services/sessionModel";

type Lang = SessionLanguage;

interface TbmTransitionStrings {
  modeChip: {
    ehs_chat: string;
    tbm_entering: string;
    tbm_running: string;
    tbm_paused: string;
    tbm_finished: string;
  };
  toast: {
    enter: (workTitle: string) => string;
    pause: (reason: string, checkpoint?: string) => string;
    resume: string;
    cancel: (reason?: string) => string;
    sessionSwitching: string;
  };
  action: {
    resume: string;
    cancel: string;
  };
}

const STRINGS: Record<Lang, TbmTransitionStrings> = {
  korean: {
    modeChip: {
      ehs_chat: "EHS 채팅",
      tbm_entering: "TBM 준비",
      tbm_running: "TBM 진행 중",
      tbm_paused: "TBM 일시중지",
      tbm_finished: "TBM 완료",
    },
    toast: {
      enter: (w) => `TBM 모드 진입: ${w} — 세션 전환 중`,
      pause: (r, c) => `TBM 일시중지 (${r})${c ? ` — ${c}` : ""}`,
      resume: "TBM 재개",
      cancel: (r) => `TBM 취소${r ? ` — ${r}` : ""} — 세션 전환 중`,
      sessionSwitching: "세션 전환 중",
    },
    action: { resume: "재개", cancel: "종료" },
  },
  english: {
    modeChip: {
      ehs_chat: "EHS Chat",
      tbm_entering: "TBM Setup",
      tbm_running: "TBM Active",
      tbm_paused: "TBM Paused",
      tbm_finished: "TBM Done",
    },
    toast: {
      enter: (w) => `Entering TBM: ${w} — switching session`,
      pause: (r, c) => `TBM paused (${r})${c ? ` — ${c}` : ""}`,
      resume: "TBM resumed",
      cancel: (r) => `TBM cancelled${r ? ` — ${r}` : ""} — switching session`,
      sessionSwitching: "Switching session",
    },
    action: { resume: "Resume", cancel: "End" },
  },
  vietnamese: {
    modeChip: {
      ehs_chat: "Chat EHS",
      tbm_entering: "Chuẩn bị TBM",
      tbm_running: "TBM đang chạy",
      tbm_paused: "TBM tạm dừng",
      tbm_finished: "TBM hoàn tất",
    },
    toast: {
      enter: (w) => `Vào TBM: ${w} — đang chuyển phiên`,
      pause: (r, c) => `TBM tạm dừng (${r})${c ? ` — ${c}` : ""}`,
      resume: "Tiếp tục TBM",
      cancel: (r) => `Hủy TBM${r ? ` — ${r}` : ""} — đang chuyển phiên`,
      sessionSwitching: "Đang chuyển phiên",
    },
    action: { resume: "Tiếp tục", cancel: "Kết thúc" },
  },
  thai: {
    modeChip: {
      ehs_chat: "แชท EHS",
      tbm_entering: "เตรียม TBM",
      tbm_running: "TBM กำลังดำเนินการ",
      tbm_paused: "TBM หยุดชั่วคราว",
      tbm_finished: "TBM เสร็จสิ้น",
    },
    toast: {
      enter: (w) => `เข้าสู่ TBM: ${w} — กำลังสลับเซสชัน`,
      pause: (r, c) => `TBM หยุดชั่วคราว (${r})${c ? ` — ${c}` : ""}`,
      resume: "ดำเนินการ TBM ต่อ",
      cancel: (r) => `ยกเลิก TBM${r ? ` — ${r}` : ""} — กำลังสลับเซสชัน`,
      sessionSwitching: "กำลังสลับเซสชัน",
    },
    action: { resume: "ดำเนินการต่อ", cancel: "สิ้นสุด" },
  },
  indonesian: {
    modeChip: {
      ehs_chat: "Chat EHS",
      tbm_entering: "Persiapan TBM",
      tbm_running: "TBM Berlangsung",
      tbm_paused: "TBM Dijeda",
      tbm_finished: "TBM Selesai",
    },
    toast: {
      enter: (w) => `Masuk TBM: ${w} — mengganti sesi`,
      pause: (r, c) => `TBM dijeda (${r})${c ? ` — ${c}` : ""}`,
      resume: "TBM dilanjutkan",
      cancel: (r) => `Batal TBM${r ? ` — ${r}` : ""} — mengganti sesi`,
      sessionSwitching: "Mengganti sesi",
    },
    action: { resume: "Lanjut", cancel: "Akhiri" },
  },
};

export function getTbmTransitionStrings(language: Lang): TbmTransitionStrings {
  return STRINGS[language] ?? STRINGS.korean;
}
