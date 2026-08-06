import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "@untitledui/icons";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { TaskPriority } from "@/features/board/store";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

type PrioritySelectProps = {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
};

export function PrioritySelect({ value, onChange }: PrioritySelectProps) {
  const { t } = useSpace();
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function label(p: TaskPriority) {
    return t(
      p === "low"
        ? "board.pLow"
        : p === "medium"
          ? "board.pMed"
          : p === "high"
            ? "board.pHigh"
            : "board.pCrit",
    );
  }

  return (
    <div className={`vs-prioritySelect${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`vs-priorityTrigger is-${value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("board.priority")}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label(value)}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <ul className="vs-priorityMenu" role="listbox" aria-labelledby={id}>
          {PRIORITIES.map((p) => (
            <li key={p}>
              <button
                type="button"
                role="option"
                aria-selected={p === value}
                className={`vs-priorityOption is-${p}${p === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
              >
                {label(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
