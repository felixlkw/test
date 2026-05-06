// LangDropdown — App.tsx L1296-1320 이전.
// PR 1: Portal 위치만 분리. 좌표 계산 등 정교화는 후속 PR.
// PR 1 동작 보존: 기존 z-[100] 영역은 #portal-root 안에 위치 → DOM 순서로 stack.
import { useEffect } from "react";
import type { SessionLanguage } from "../../services/sessionModel";
import { LANGUAGE_CONFIG } from "../i18n/languageConfig";

interface LangDropdownProps {
  open: boolean;
  currentLanguage: SessionLanguage;
  onSelect: (lang: SessionLanguage) => void;
  onClose: () => void;
  /** 트리거 버튼의 ref (좌표 계산용) — 미제공 시 안전상자(우상단 고정) */
  anchorRect?: DOMRect | null;
  disabled?: boolean;
}

export function LangDropdown({
  open,
  currentLanguage,
  onSelect,
  onClose,
  anchorRect,
  disabled,
}: LangDropdownProps) {
  // click outside (App.tsx L329-340 이전)
  // Cycle 2 이슈 6: race condition 보강. open=true 토글의 원인이 된 click 이벤트가
  // document listener까지 native bubble을 타고 올라가 즉시 onClose를 트리거하는 것을
  // 방지하기 위해 (a) mousedown 대신 click + (b) 다음 task에 listener 등록.
  // closest 검사로도 막혀 있으나, Portal/native bubble 환경에서 안전한 추가 가드.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (target?.closest?.("[data-lang-dropdown]")) return;
      if (target?.closest?.("[data-lang-chip]")) return;
      onClose();
    };
    // setTimeout 0: 현재 click 이벤트 루프가 끝난 뒤 다음 task에 등록 → 자기 자신을 트리거하지 않음.
    const handle = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(handle);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  // 좌표 계산 — anchorRect가 있으면 그 아래, 아니면 우상단 fallback.
  const top = anchorRect ? anchorRect.bottom + 4 : 56;
  const right = anchorRect ? window.innerWidth - anchorRect.right : 16;

  return (
    <div
      data-lang-dropdown
      className="fixed bg-white border border-pwc-border rounded-lg shadow-lg min-w-[140px]"
      style={{ top, right, zIndex: 30 }}
    >
      {Object.entries(LANGUAGE_CONFIG).map(([key, config]) => (
        <button
          key={key}
          className={`w-full px-3 py-2 text-left text-xs hover:bg-pwc-orange-wash transition-colors flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg ${
            currentLanguage === key
              ? "bg-pwc-orange/20 text-pwc-ink"
              : "text-pwc-ink-soft"
          }`}
          onClick={() => onSelect(key as SessionLanguage)}
          disabled={disabled}
        >
          <span>{config.flag}</span>
          <span>{config.name}</span>
        </button>
      ))}
    </div>
  );
}
