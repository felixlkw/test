// PrepareContextForm — PR A_v2-3 (c8 §5), 확장: PR-feedback-5 / PR-2 (v0.3.0).
//
// 옵셔널 컨텍스트 입력 폼. 작업 선택 카드 아래에 배치되며 모든 필드는 선택사항이다.
// 풍속(wind_speed_mps) 필드는 옥외 도메인(construction · heavy_industry)에만
// 노출. 변경 시 PrepareScreen이 debounce 1.5s 후 자동 재추천을 트리거한다.
//
// 사용
//   <PrepareContextForm
//     value={context}
//     onChange={setContext}
//     disabled={!aiContextEnabled}
//     domain={domain}
//     language={language}
//   />
//
// 디자인
//   - PwC 토큰만 사용. Tailwind 인라인 스타일 0.
//   - <details open> 기본 펼침 — PR B+ NEW-H1 발견성 보강 (felix lock §6 Q1=A).
//   - chips 입력은 enter / comma 분리. Backspace로 마지막 chip 제거.
//
// invariants
//   #7: 모두 옵셔널, undefined 안전.
//   #10: form 자체는 PrepareScreen state — 비영속 view state 아님, 영속
//        prepared_context로 저장됨. PR-2: prior_info 3 슬롯은 startTbm에서
//        prior_info로 mirror(transient form state).
//
// PR-2 (v0.3.0) — 사전정보 superset 확장:
//   - value 타입 `PreparedContext` → `PrepareContextFormValue` (= PreparedContext
//     + 3 옵셔널 transient: workLocation / workContentDetails / equipmentDetails).
//   - 라벨 5언어(ko/en/vi/th/id) 분기 — `LABELS` 사전 신설(이 컴포넌트 첫 다국어).
//   - new_material 라벨 "신규/특이 자재 또는 공정"으로 정리(필드 키 유지).
//   - filledCount 9 필드 카운트. worker_count는 truthy 룰(사용자 결정 — 0=미입력),
//     wind_speed_mps는 !== undefined 룰(0이 무풍 실값).

import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  PreparedContext,
  SessionDomain,
  SessionLanguage,
} from "../services/sessionModel";

/** PR-feedback-5 — PrepareContextForm의 입력값 superset. PreparedContext(영속) +
 *  prior_info 3 슬롯(transient, startTbm에서 prior_info로 hydration mirror). */
export interface PrepareContextFormValue extends PreparedContext {
  workLocation?: string;
  workContentDetails?: string;
  equipmentDetails?: string;
}

export interface PrepareContextFormProps {
  value: PrepareContextFormValue;
  onChange: (next: PrepareContextFormValue) => void;
  disabled?: boolean;
  /** 풍속 필드는 옥외 도메인만 노출. 외 도메인은 hide. */
  domain: SessionDomain | undefined;
  /** PR-feedback-5 (v0.3.0) — 라벨 5언어(ko, en, vi, th, id). */
  language: SessionLanguage;
}

// Prepare 폼 라벨 다국어 사전. 5 언어.
// 기존 4 라벨 + 신규 3 라벨 + new_material 라벨 정리.
type PrepareFormLabels = {
  section_title: string;
  section_hint_active: string;
  section_hint_disabled: string;
  filled_count_suffix: string;  // "개 입력됨"
  empty: string;                // "비어 있음"
  worker_count: string;
  shift: string;
  shift_options: {
    none: string; day: string; night: string; rotating: string; other: string;
  };
  wind_speed: string;
  new_material: string;          // PR-feedback-5: "신규/특이 자재 또는 공정"
  special_notes: string;
  incident_keywords: string;
  incident_keywords_hint_empty: string;
  incident_keywords_hint_filled: string;
  incident_keywords_pii_note: string;
  // PR-feedback-5 신규 3 필드
  work_location: string;
  work_content_details: string;
  equipment_details: string;
};

export const LABELS: Record<SessionLanguage, PrepareFormLabels> = {
  korean: {
    section_title: "오늘의 현장 정보 (선택)",
    section_hint_active: "입력하면 AI가 더 구체적인 위험 추천을 제공합니다.",
    section_hint_disabled: "이 도메인은 컨텍스트 활용이 비활성화되어 있습니다.",
    filled_count_suffix: "개 입력됨",
    empty: "비어 있음",
    worker_count: "작업자 수",
    shift: "교대",
    shift_options: { none: "선택 안 함", day: "주간", night: "야간", rotating: "교대 순환", other: "기타" },
    wind_speed: "풍속 (m/s)",
    new_material: "신규/특이 자재 또는 공정",
    special_notes: "특이사항",
    incident_keywords: "과거 사고 키워드",
    incident_keywords_hint_empty: "예: 추락, 협착, 가스누출 (Enter / 쉼표로 추가)",
    incident_keywords_hint_filled: "추가 키워드 입력 후 Enter",
    incident_keywords_pii_note: "개인정보(이름·주소)는 입력하지 마세요. 키워드만 짧게 (예: 추락, 협착).",
    work_location: "작업장소",
    work_content_details: "작업내용",
    equipment_details: "장비정보",
  },
  english: {
    section_title: "Today's site context (optional)",
    section_hint_active: "Filling these gives the AI better hazard recommendations.",
    section_hint_disabled: "Context usage is disabled for this domain.",
    filled_count_suffix: " filled",
    empty: "Empty",
    worker_count: "Workers",
    shift: "Shift",
    shift_options: { none: "Not selected", day: "Day", night: "Night", rotating: "Rotating", other: "Other" },
    wind_speed: "Wind speed (m/s)",
    new_material: "New/special material or process",
    special_notes: "Special notes",
    incident_keywords: "Past incident keywords",
    incident_keywords_hint_empty: "e.g. fall, pinch, gas leak (Enter or comma to add)",
    incident_keywords_hint_filled: "Type and press Enter",
    incident_keywords_pii_note: "Do not enter PII (names, addresses). Short keywords only.",
    work_location: "Work location",
    work_content_details: "Work details",
    equipment_details: "Equipment",
  },
  vietnamese: {
    section_title: "Thông tin công trường hôm nay (tùy chọn)",
    section_hint_active: "Điền thêm để AI gợi ý rủi ro cụ thể hơn.",
    section_hint_disabled: "Ngữ cảnh bị vô hiệu hóa cho lĩnh vực này.",
    filled_count_suffix: " mục đã nhập",
    empty: "Trống",
    worker_count: "Số công nhân",
    shift: "Ca",
    shift_options: { none: "Không chọn", day: "Ban ngày", night: "Ban đêm", rotating: "Luân phiên", other: "Khác" },
    wind_speed: "Tốc độ gió (m/s)",
    new_material: "Vật liệu/quy trình mới hoặc đặc biệt",
    special_notes: "Ghi chú đặc biệt",
    incident_keywords: "Từ khóa sự cố trước đây",
    incident_keywords_hint_empty: "vd: ngã, kẹp, rò khí (Enter hoặc dấu phẩy)",
    incident_keywords_hint_filled: "Nhập rồi nhấn Enter",
    incident_keywords_pii_note: "Không nhập thông tin cá nhân (tên, địa chỉ). Chỉ từ khóa ngắn.",
    work_location: "Vị trí làm việc",
    work_content_details: "Nội dung công việc",
    equipment_details: "Thiết bị",
  },
  thai: {
    section_title: "ข้อมูลหน้างานวันนี้ (ไม่บังคับ)",
    section_hint_active: "การกรอกข้อมูลช่วยให้ AI แนะนำความเสี่ยงได้แม่นยำขึ้น",
    section_hint_disabled: "บริบทถูกปิดใช้งานสำหรับโดเมนนี้",
    filled_count_suffix: " รายการที่กรอก",
    empty: "ว่างเปล่า",
    worker_count: "จำนวนคนงาน",
    shift: "กะ",
    shift_options: { none: "ไม่เลือก", day: "กลางวัน", night: "กลางคืน", rotating: "หมุนเวียน", other: "อื่นๆ" },
    wind_speed: "ความเร็วลม (m/s)",
    new_material: "วัสดุ/กระบวนการใหม่หรือพิเศษ",
    special_notes: "หมายเหตุพิเศษ",
    incident_keywords: "คำหลักเหตุการณ์ในอดีต",
    incident_keywords_hint_empty: "เช่น ตก, หนีบ, ก๊าซรั่ว (Enter หรือเครื่องหมายจุลภาค)",
    incident_keywords_hint_filled: "พิมพ์แล้วกด Enter",
    incident_keywords_pii_note: "ห้ามกรอกข้อมูลส่วนบุคคล (ชื่อ ที่อยู่) ใส่เฉพาะคำหลักสั้นๆ",
    work_location: "สถานที่ทำงาน",
    work_content_details: "เนื้อหางาน",
    equipment_details: "อุปกรณ์",
  },
  indonesian: {
    section_title: "Konteks lokasi kerja hari ini (opsional)",
    section_hint_active: "Mengisi ini membantu AI memberi rekomendasi bahaya yang lebih tepat.",
    section_hint_disabled: "Konteks dinonaktifkan untuk domain ini.",
    filled_count_suffix: " terisi",
    empty: "Kosong",
    worker_count: "Jumlah pekerja",
    shift: "Shift",
    shift_options: { none: "Tidak dipilih", day: "Siang", night: "Malam", rotating: "Bergilir", other: "Lainnya" },
    wind_speed: "Kecepatan angin (m/s)",
    new_material: "Material/proses baru atau khusus",
    special_notes: "Catatan khusus",
    incident_keywords: "Kata kunci insiden lampau",
    incident_keywords_hint_empty: "mis. jatuh, terjepit, kebocoran gas (Enter atau koma)",
    incident_keywords_hint_filled: "Ketik dan tekan Enter",
    incident_keywords_pii_note: "Jangan masukkan PII (nama, alamat). Hanya kata kunci singkat.",
    work_location: "Lokasi kerja",
    work_content_details: "Rincian pekerjaan",
    equipment_details: "Peralatan",
  },
};

const OUTDOOR_DOMAINS: ReadonlySet<SessionDomain> = new Set([
  "construction",
  "heavy_industry",
]);

export default function PrepareContextForm({
  value,
  onChange,
  disabled = false,
  domain,
  language,
}: PrepareContextFormProps) {
  const L = LABELS[language];
  const [keywordDraft, setKeywordDraft] = useState<string>("");
  const showWind = !!domain && OUTDOOR_DOMAINS.has(domain);

  const update = useCallback(
    (patch: Partial<PrepareContextFormValue>) => {
      onChange({ ...value, ...patch });
    },
    [value, onChange],
  );

  const handleKeywordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const draft = keywordDraft.trim();
      if (!draft) return;
      const next = [...(value.previous_incident_keywords ?? []), draft];
      update({ previous_incident_keywords: next });
      setKeywordDraft("");
    } else if (e.key === "Backspace" && !keywordDraft) {
      const list = value.previous_incident_keywords ?? [];
      if (list.length === 0) return;
      update({ previous_incident_keywords: list.slice(0, -1) });
    }
  };

  const removeKeyword = (idx: number) => {
    if (disabled) return;
    const list = value.previous_incident_keywords ?? [];
    const next = list.filter((_, i) => i !== idx);
    update({ previous_incident_keywords: next.length ? next : undefined });
  };

  // number input helpers — empty string => undefined; preserve "0" as 0.
  const parseNum = (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  // PR-2 (v0.3.0) — filledCount 9 필드 카운트.
  // 사용자 결정: worker_count는 truthy 룰(0 = 미입력 = falsy).
  // wind_speed_mps는 !== undefined 룰(0 = 무풍 실값).
  const filledCount =
    (value.workLocation ? 1 : 0) +
    (value.workContentDetails ? 1 : 0) +
    (value.worker_count ? 1 : 0) +
    (value.shift ? 1 : 0) +
    (value.equipmentDetails ? 1 : 0) +
    (value.wind_speed_mps !== undefined ? 1 : 0) +
    (value.new_material ? 1 : 0) +
    (value.special_notes ? 1 : 0) +
    ((value.previous_incident_keywords?.length ?? 0) > 0 ? 1 : 0);

  return (
    <details
      open
      className="rounded-pwc border border-pwc-border bg-white open:shadow-pwc-card transition-shadow"
    >
      <summary
        className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none list-none"
        // hide default marker
      >
        <div className="min-w-0">
          <div className="text-[13px] font-bold uppercase tracking-wider text-pwc-orange">
            {L.section_title}
          </div>
          <div className="text-[11px] text-pwc-ink-mute mt-0.5">
            {disabled ? L.section_hint_disabled : L.section_hint_active}
          </div>
        </div>
        <span className="text-[11px] text-pwc-ink-soft shrink-0">
          {filledCount > 0
            ? `${filledCount}${L.filled_count_suffix}`
            : L.empty}
        </span>
      </summary>

      <fieldset
        className="border-t border-pwc-border px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
        disabled={disabled}
      >
        {/* 작업장소 — PR-feedback-5 신규 */}
        <label className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.work_location}
          </span>
          <input
            type="text"
            value={value.workLocation ?? ""}
            onChange={(e) =>
              update({ workLocation: e.target.value || undefined })
            }
            placeholder={
              language === "korean" ? "예: A동 3층 옥상, B라인 클린룸" : ""
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 작업내용 — PR-feedback-5 신규 */}
        <label className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.work_content_details}
          </span>
          <input
            type="text"
            value={value.workContentDetails ?? ""}
            onChange={(e) =>
              update({ workContentDetails: e.target.value || undefined })
            }
            placeholder={
              language === "korean"
                ? "예: 외벽 도장, 배관 보수, 웨이퍼 이송"
                : ""
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 작업자 수 — 기존 */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.worker_count}
          </span>
          <input
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            value={value.worker_count ?? ""}
            onChange={(e) => update({ worker_count: parseNum(e.target.value) })}
            placeholder={language === "korean" ? "예: 5" : ""}
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 교대 — 기존 */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.shift}
          </span>
          <select
            value={value.shift ?? ""}
            onChange={(e) =>
              update({ shift: e.target.value || undefined })
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{L.shift_options.none}</option>
            <option value="day">{L.shift_options.day}</option>
            <option value="night">{L.shift_options.night}</option>
            <option value="rotating">{L.shift_options.rotating}</option>
            <option value="other">{L.shift_options.other}</option>
          </select>
        </label>

        {/* 장비정보 — PR-feedback-5 신규 */}
        <label className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.equipment_details}
          </span>
          <input
            type="text"
            value={value.equipmentDetails ?? ""}
            onChange={(e) =>
              update({ equipmentDetails: e.target.value || undefined })
            }
            placeholder={
              language === "korean"
                ? "예: 5m 사다리, 안전벨트, 가스측정기"
                : ""
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 풍속 — 옥외 도메인만 */}
        {showWind && (
          <label className="block">
            <span className="text-[12px] font-semibold text-pwc-ink-soft">
              {L.wind_speed}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              inputMode="decimal"
              value={value.wind_speed_mps ?? ""}
              onChange={(e) =>
                update({ wind_speed_mps: parseNum(e.target.value) })
              }
              placeholder={language === "korean" ? "예: 12" : ""}
              className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
        )}

        {/* 신규 자재 / 공정 — 라벨 변경(필드 키 new_material 유지) */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.new_material}
          </span>
          <input
            type="text"
            value={value.new_material ?? ""}
            onChange={(e) =>
              update({ new_material: e.target.value || undefined })
            }
            placeholder={language === "korean" ? "예: 새 페인트, 신규 용접봉" : ""}
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 특이사항 — full width */}
        <label className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.special_notes}
          </span>
          <textarea
            rows={2}
            value={value.special_notes ?? ""}
            onChange={(e) =>
              update({ special_notes: e.target.value || undefined })
            }
            placeholder={
              language === "korean"
                ? "예: 인접 공정 가동 중, 작업자 1명 컨디션 저하 등"
                : ""
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 과거 사고 키워드 — chips */}
        <div className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            {L.incident_keywords}
          </span>
          <div className="mt-1 flex flex-wrap gap-2 items-center rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 min-h-[42px]">
            {(value.previous_incident_keywords ?? []).map((kw, i) => (
              <span
                key={`${kw}-${i}`}
                className="inline-flex items-center gap-1 rounded-pwc bg-pwc-orange-soft text-pwc-orange-deep px-2 py-0.5 text-[12px]"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => removeKeyword(i)}
                  disabled={disabled}
                  aria-label={`${kw} 키워드 제거`}
                  className="hover:text-pwc-ink disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              placeholder={
                (value.previous_incident_keywords?.length ?? 0) === 0
                  ? L.incident_keywords_hint_empty
                  : L.incident_keywords_hint_filled
              }
              className="flex-1 min-w-[160px] bg-transparent text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-[11px] text-pwc-ink-mute mt-1">
            {L.incident_keywords_pii_note}
          </p>
        </div>
      </fieldset>
    </details>
  );
}
