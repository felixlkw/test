// WorkTypeCatalog — PR A. Renders the per-domain work-type grid on PrepareScreen.
// Static JSON catalog (c6 결정 4 = A). Phase 2.2에서 backend DB로 이관 가능.
import type { WorkType } from "../services/recommendHazards";

interface WorkTypeCatalogProps {
  workTypes: WorkType[];
  selectedId?: string;
  onSelect: (workTypeId: string) => void;
  loading?: boolean;
  error?: string | null;
}

export default function WorkTypeCatalog({
  workTypes,
  selectedId,
  onSelect,
  loading,
  error,
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
                {wt.label_ko}
              </div>
              <div className="text-[11px] text-pwc-ink-mute mt-1">
                {wt.label_en}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
