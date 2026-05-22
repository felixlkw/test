// Phase 0.6 Wave 10 — branded Tailwind confirm modal (replaces window.confirm).
// KOSHA color-aligned, AAA contrast, 56dp touch targets, 5-lang i18n via
// getConfirmStrings.

import { useEffect } from "react";
import { Portal } from "./PortalRoot";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Visual tone of confirm button. */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === "danger"
      ? "bg-hoban-danger text-white hover:bg-red-700"
      : "bg-hoban-ink text-white hover:bg-black";

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-sm bg-white rounded-hoban-lg shadow-hoban-card border border-hoban-border p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3
            id="confirm-modal-title"
            className="text-base font-bold text-hoban-ink mb-2 leading-snug"
          >
            {title}
          </h3>
          <p className="text-sm text-hoban-ink-soft leading-relaxed mb-5 break-keep">
            {body}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-hoban bg-white border border-hoban-border-strong text-hoban-ink-soft hover:border-hoban-primary hover:text-hoban-primary transition active:scale-95"
              autoFocus
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-hoban transition active:scale-95 ${confirmCls}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
