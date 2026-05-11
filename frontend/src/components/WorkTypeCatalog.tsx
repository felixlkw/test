// WorkTypeCatalog — PR A. Renders the per-domain work-type grid on PrepareScreen.
// Static JSON catalog (c6 결정 4 = A). Phase 2.2에서 backend DB로 이관 가능.
//
// v0.2.6 PR-5 — label 다국어 분기.
//   기존 `label_ko` + `label_en` 하드코딩 표시 → `pickLabel(workType, language)`
//   호출로 교체. ko/en 외에 vi/th/id도 카탈로그 JSON에 신규 `label_vi`/`label_th`/
//   `label_id`가 채워지면 현지어로, 비어있으면 ko로 폴백.
//   보조 라벨(작은 텍스트)은 현지어와 다를 때만 한국어 원문을 추가 노출 — 한·영 동시
//   노출하던 v0.2.5 UX 유지 + 비-한국어 사용자에게 원문 참조 보조 역할.
import type { WorkType } from "../services/recommendHazards";
import { pickLabel } from "../services/catalogI18n";
import type { SessionLanguage } from "../services/sessionModel";

interface WorkTypeCatalogProps {
  workTypes: WorkType[];
  selectedId?: string;
  onSelect: (workTypeId: string) => void;
  loading?: boolean;
  error?: string | null;
  /** v0.2.6 PR-5: 현재 세션 언어. 미지정 시 "korean"으로 폴백(v0.2.5 동작 유지). */
  language?: SessionLanguage;
}

export default function WorkTypeCatalog({
  workTypes,
  selectedId,
  onSelect,
  loading,
  error,
  language = "korean",
}: WorkTypeCatalogProps) {
  if (loading) {
    return (
      <div className="text-sm text-pwc-ink-mute py-4" role="status" aria-live="polite">
        작업유형 불러오는 중…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="text-sm text-pwc-orange-deep border border-pwc-orange-deep/40 rounded-pwc px-3 py-2"
        role="alert"
      >
        작업유형을 불러오지 못했습니다 — {error}
      </div>
    );
  }
  if (!workTypes.length) {
    return (
      <div className="text-sm text-pwc-ink-mute py-4">
        선택 가능한 작업유형이 없습니다. 도메인을 다시 확인하세요.
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="작업유형 선택">
      {workTypes.map((wt) => {
        const selected = wt.id === selectedId;
        // v0.2.6 PR-5: primary 라벨은 현재 언어로 노출. 보조 라벨은:
        //   - 한국어 사용자: 기존처럼 영문(label_en) 보조 표기 유지.
        //   - 비-한국어: primary가 ko 폴백이 아니면 한국어 원문(label_ko)을 보조 표기,
        //     primary가 ko 폴백(=label_ko와 동일)이면 보조 표기 생략(중복 회피).
        const primary = pickLabel(wt, language);
        const secondary: string =
          language === "korean"
            ? wt.label_en ?? ""
            : primary !== wt.label_ko
              ? wt.label_ko ?? ""
              : "";
        return (
          <li key={wt.id}>
            <button
              type="button"
              onClick={() => onSelect(wt.id)}
              aria-pressed={selected}
              className={
                "w-full text-left rounded-pwc border p-4 transition focus-visible:outline-2 focus-visible:outline-pwc-orange focus-visible:outline-offset-2 " +
                (selected
                  ? "border-pwc-orange bg-pwc-orange-wash"
                  : "border-pwc-border hover:border-pwc-orange")
              }
            >
              <div className="text-sm font-semibold text-pwc-ink">
                {primary}
              </div>
              {secondary && (
                <div className="text-[11px] text-pwc-ink-mute mt-1">
                  {secondary}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
