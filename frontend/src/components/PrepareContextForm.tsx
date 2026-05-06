// PrepareContextForm — PR A_v2-3 (c8 §5).
//
// 옵셔널 컨텍스트 입력 폼. 작업 선택 카드 아래에 배치되며 모든 필드는 선택사항이다.
// 풍속(wind_speed_mps) 필드는 옥외 도메인(construction · heavy_industry)에만
// 노출. 변경 시 PrepareScreen이 debounce 500ms 후 자동 재추천을 트리거한다.
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
//   #10: form 자체는 PrepareScreen state — 비영속 view state 아님, 영속 prepared_context로 저장됨.

import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  PreparedContext,
  SessionDomain,
  SessionLanguage,
} from "../services/sessionModel";

export interface PrepareContextFormProps {
  value: PreparedContext;
  onChange: (next: PreparedContext) => void;
  disabled?: boolean;
  /** 풍속 필드는 옥외 도메인만 노출. 외 도메인은 hide. */
  domain: SessionDomain | undefined;
  /** 라벨 다국어는 PR A_v2-3 단계엔 한국어만 (felix가 향후 다국어 시 i18n 보강). */
  language: SessionLanguage;
}

const SHIFT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "선택 안 함" },
  { value: "day", label: "주간" },
  { value: "night", label: "야간" },
  { value: "rotating", label: "교대 순환" },
  { value: "other", label: "기타" },
];

const OUTDOOR_DOMAINS: ReadonlySet<SessionDomain> = new Set([
  "construction",
  "heavy_industry",
]);

export default function PrepareContextForm({
  value,
  onChange,
  disabled = false,
  domain,
  language: _language,
}: PrepareContextFormProps) {
  void _language; // 다국어는 다음 cycle. 한국어 라벨 고정.
  const [keywordDraft, setKeywordDraft] = useState<string>("");
  const showWind = !!domain && OUTDOOR_DOMAINS.has(domain);

  const update = useCallback(
    (patch: Partial<PreparedContext>) => {
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

  const filledCount =
    (value.worker_count !== undefined ? 1 : 0) +
    (value.shift ? 1 : 0) +
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
            오늘의 현장 정보 (선택)
          </div>
          <div className="text-[11px] text-pwc-ink-mute mt-0.5">
            {disabled
              ? "이 도메인은 컨텍스트 활용이 비활성화되어 있습니다."
              : "입력하면 AI가 더 구체적인 위험 추천을 제공합니다."}
          </div>
        </div>
        <span className="text-[11px] text-pwc-ink-soft shrink-0">
          {filledCount > 0 ? `${filledCount}개 입력됨` : "비어 있음"}
        </span>
      </summary>

      <fieldset
        className="border-t border-pwc-border px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
        disabled={disabled}
      >
        {/* 작업자 수 */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            작업자 수
          </span>
          <input
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            value={value.worker_count ?? ""}
            onChange={(e) => update({ worker_count: parseNum(e.target.value) })}
            placeholder="예: 5"
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 교대 */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">교대</span>
          <select
            value={value.shift ?? ""}
            onChange={(e) =>
              update({ shift: e.target.value || undefined })
            }
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {SHIFT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* 풍속 — 옥외 도메인만 */}
        {showWind && (
          <label className="block">
            <span className="text-[12px] font-semibold text-pwc-ink-soft">
              풍속 (m/s)
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
              placeholder="예: 12"
              className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
        )}

        {/* 신규 자재 */}
        <label className="block">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            신규 자재 / 공정
          </span>
          <input
            type="text"
            value={value.new_material ?? ""}
            onChange={(e) =>
              update({ new_material: e.target.value || undefined })
            }
            placeholder="예: 새 페인트, 신규 용접봉"
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 특이사항 — full width */}
        <label className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            특이사항
          </span>
          <textarea
            rows={2}
            value={value.special_notes ?? ""}
            onChange={(e) =>
              update({ special_notes: e.target.value || undefined })
            }
            placeholder="예: 인접 공정 가동 중, 작업자 1명 컨디션 저하 등"
            className="mt-1 w-full rounded-pwc border border-pwc-border bg-pwc-bg-soft px-3 py-2 text-sm focus:border-pwc-orange focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        {/* 과거 사고 키워드 — chips */}
        <div className="block sm:col-span-2">
          <span className="text-[12px] font-semibold text-pwc-ink-soft">
            과거 사고 키워드
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
                  ? "예: 추락, 협착, 가스누출 (Enter / 쉼표로 추가)"
                  : "추가 키워드 입력 후 Enter"
              }
              className="flex-1 min-w-[160px] bg-transparent text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-[11px] text-pwc-ink-mute mt-1">
            개인정보(이름·주소)는 입력하지 마세요. 키워드만 짧게 (예: 추락, 협착).
          </p>
        </div>
      </fieldset>
    </details>
  );
}
