// Phase 0.6 Wave 10 — i18n for confirm dialogs across 5 languages.
// Replaces window.confirm() with branded Tailwind modal so KOSHA-aligned
// safety messaging works for foreign workers (Critic P0 #2).

import type { SessionLanguage } from "../../services/sessionModel";

type Lang = SessionLanguage;

export interface ConfirmStrings {
  backToEhs: {
    title: string;
    body: string;
    confirm: string;
    cancel: string;
  };
  modeSwitch: {
    title: string;
    body: string;
    confirm: string;
    cancel: string;
  };
  manufacturingForced: {
    title: string;
    body: string;
  };
  ok: string;
  cancel: string;
}

const STRINGS: Record<Lang, ConfirmStrings> = {
  korean: {
    backToEhs: {
      title: "TBM 종료하고 EHS 채팅으로",
      body: "TBM 을 종료하고 EHS 채팅으로 돌아갑니다. 진행 중인 TBM 기록은 자동 저장되어 보존됩니다.",
      confirm: "EHS로 이동",
      cancel: "TBM 계속",
    },
    modeSwitch: {
      title: "모드 전환",
      body: "음성 세션이 재시작되고 진행 중인 대화·체크리스트가 초기화됩니다.",
      confirm: "계속",
      cancel: "취소",
    },
    manufacturingForced: {
      title: "표준 작업만 가능",
      body: "이 도메인은 표준 절차를 따라야 하는 작업이라 카탈로그에서만 선택할 수 있습니다.",
    },
    ok: "확인",
    cancel: "취소",
  },
  english: {
    backToEhs: {
      title: "End TBM and return to EHS chat",
      body: "End the TBM session and return to open EHS chat. The TBM record will be saved automatically.",
      confirm: "Go to EHS",
      cancel: "Continue TBM",
    },
    modeSwitch: {
      title: "Switch mode",
      body: "The voice session will restart and the current conversation/checklist will reset.",
      confirm: "Continue",
      cancel: "Cancel",
    },
    manufacturingForced: {
      title: "Catalog only",
      body: "This domain requires standard procedures, so work types can only be chosen from the catalog.",
    },
    ok: "OK",
    cancel: "Cancel",
  },
  vietnamese: {
    backToEhs: {
      title: "Kết thúc TBM và quay lại EHS chat",
      body: "Kết thúc phiên TBM và quay lại EHS chat. Hồ sơ TBM sẽ được lưu tự động.",
      confirm: "Sang EHS",
      cancel: "Tiếp tục TBM",
    },
    modeSwitch: {
      title: "Chuyển chế độ",
      body: "Phiên thoại sẽ khởi động lại và hội thoại/checklist hiện tại sẽ được đặt lại.",
      confirm: "Tiếp tục",
      cancel: "Huỷ",
    },
    manufacturingForced: {
      title: "Chỉ chọn từ danh mục",
      body: "Lĩnh vực này yêu cầu tuân theo quy trình chuẩn, nên loại công việc chỉ được chọn từ danh mục.",
    },
    ok: "OK",
    cancel: "Huỷ",
  },
  thai: {
    backToEhs: {
      title: "จบ TBM และกลับไปแชท EHS",
      body: "จบเซสชัน TBM แล้วกลับไปแชท EHS บันทึก TBM จะถูกบันทึกอัตโนมัติ",
      confirm: "ไป EHS",
      cancel: "ทำ TBM ต่อ",
    },
    modeSwitch: {
      title: "เปลี่ยนโหมด",
      body: "เซสชันเสียงจะรีสตาร์ทและการสนทนา/เช็คลิสต์ปัจจุบันจะถูกรีเซ็ต",
      confirm: "ดำเนินการต่อ",
      cancel: "ยกเลิก",
    },
    manufacturingForced: {
      title: "เลือกจากแคตตาล็อกเท่านั้น",
      body: "โดเมนนี้ต้องปฏิบัติตามขั้นตอนมาตรฐาน จึงเลือกประเภทงานได้จากแคตตาล็อกเท่านั้น",
    },
    ok: "ตกลง",
    cancel: "ยกเลิก",
  },
  indonesian: {
    backToEhs: {
      title: "Akhiri TBM dan kembali ke EHS chat",
      body: "Akhiri sesi TBM dan kembali ke EHS chat. Catatan TBM akan disimpan otomatis.",
      confirm: "Ke EHS",
      cancel: "Lanjutkan TBM",
    },
    modeSwitch: {
      title: "Ganti mode",
      body: "Sesi suara akan dimulai ulang dan percakapan/checklist saat ini akan direset.",
      confirm: "Lanjutkan",
      cancel: "Batal",
    },
    manufacturingForced: {
      title: "Hanya katalog",
      body: "Domain ini memerlukan prosedur standar, sehingga jenis pekerjaan hanya dapat dipilih dari katalog.",
    },
    ok: "OK",
    cancel: "Batal",
  },
};

export function getConfirmStrings(language: Lang): ConfirmStrings {
  return STRINGS[language] ?? STRINGS.korean;
}
