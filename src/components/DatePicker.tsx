import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@untitledui/icons";
import { IconX } from "@/components/icons";
import { useSpace } from "@/features/workspace/SpaceContext";

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function toIso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type DatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  label?: string;
};

export function DatePicker({ value, onChange, label }: DatePickerProps) {
  const { locale, t } = useSpace();
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseIso(value), [value]);
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (!selected) return;
    setCursor({ year: selected.getFullYear(), month: selected.getMonth() });
  }, [selected]);

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

  const loc = locale.startsWith("ru") ? "ru-RU" : "en-US";
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString(loc, {
    month: "long",
    year: "numeric",
  });
  const weekdays = locale.startsWith("ru")
    ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const blanks = (firstWeekday + 6) % 7;
  const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const today = startOfDay(new Date());

  const display = selected
    ? selected.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" })
    : locale.startsWith("ru")
      ? "ДД.ММ.ГГГГ"
      : "MM/DD/YYYY";

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function pick(day: number) {
    onChange(toIso(new Date(cursor.year, cursor.month, day)));
    setOpen(false);
  }

  return (
    <div className={`vs-datePicker${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`vs-datePickerTrigger${value ? " has-value" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Calendar size={15} aria-hidden />
        <span>{display}</span>
        {value ? (
          <span
            className="vs-datePickerClear"
            role="button"
            tabIndex={0}
            aria-label={t("date.clear")}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }
            }}
          >
            <IconX size={12} />
          </span>
        ) : null}
      </button>

      {open && (
        <div className="vs-datePopover" role="dialog" aria-labelledby={id}>
          <div className="vs-datePopoverHead">
            <strong>{monthLabel}</strong>
            <div className="vs-datePopoverNav">
              <button type="button" className="vs-iconBtn" onClick={() => shiftMonth(-1)} aria-label="Prev">
                <ChevronLeft size={15} aria-hidden />
              </button>
              <button type="button" className="vs-iconBtn" onClick={() => shiftMonth(1)} aria-label="Next">
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>
          </div>
          <div className="vs-datePopoverWeek">
            {weekdays.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="vs-datePopoverGrid">
            {Array.from({ length: blanks }).map((_, i) => (
              <span key={`b-${i}`} className="vs-datePopoverEmpty" />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const date = new Date(cursor.year, cursor.month, day);
              const isSelected = selected ? sameDay(date, selected) : false;
              const isToday = sameDay(date, today);
              return (
                <button
                  key={day}
                  type="button"
                  className={`vs-datePopoverDay${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="vs-datePopoverFoot">
            <button
              type="button"
              className="vs-datePopoverLink"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("date.clear")}
            </button>
            <button
              type="button"
              className="vs-datePopoverLink is-accent"
              onClick={() => {
                onChange(toIso(new Date()));
                setOpen(false);
              }}
            >
              {t("date.today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
