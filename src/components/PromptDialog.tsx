import { useEffect, useId, useRef, useState } from "react";

type PromptDialogProps = {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

/** Dark in-app prompt — replaces native window.prompt. */
export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="vs-modalScrim vs-promptScrim" role="presentation" onClick={onCancel}>
      <form
        className="vs-modal vs-promptModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next) return;
          onConfirm(next);
        }}
      >
        <div className="vs-modalHeader">
          <strong id={titleId}>{title}</strong>
        </div>
        <label className="vs-promptField">
          <span>{label}</span>
          <input
            ref={inputRef}
            className="vs-modalInput"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="vs-modalActions">
          <button type="button" className="vs-btn vs-btnGhost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="submit" className="vs-btn vs-btnPrimary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive action styling (delete). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="vs-modalScrim vs-promptScrim" role="presentation" onClick={onCancel}>
      <div
        className="vs-modal vs-promptModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vs-modalHeader">
          <strong id={titleId}>{title}</strong>
        </div>
        <p className="vs-modalLead">{body}</p>
        <div className="vs-modalActions">
          <button type="button" className="vs-btn vs-btnGhost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`vs-btn${danger ? " vs-btnDanger" : " vs-btnPrimary"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
