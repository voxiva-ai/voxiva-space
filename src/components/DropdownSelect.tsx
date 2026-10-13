import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  testId?: string;
};

export function DropdownSelect({ label, value, options, onChange, className = "", testId }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (!open) {
      if (menu.matches(":popover-open")) menu.hidePopover();
      return;
    }
    if (!menu.matches(":popover-open")) menu.showPopover();
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 10;
      const gap = 6;
      const width = Math.min(Math.max(rect.width, 240), innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, innerWidth - width - margin));
      menu.style.width = `${width}px`;
      menu.style.height = "auto";
      menu.style.maxHeight = "none";
      const below = Math.max(0, innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const naturalHeight = Math.min(320, menu.getBoundingClientRect().height);
      const openAbove = below < naturalHeight && above > below;
      const height = Math.min(naturalHeight, openAbove ? above : below);
      menu.style.left = `${left}px`;
      menu.style.maxHeight = `${height}px`;
      menu.style.top = `${openAbove ? rect.top - gap - height : rect.bottom + gap}px`;
    };
    place();
    optionRefs.current[selectedIndex]?.focus();
    window.addEventListener("resize", place);
    const onScroll = (event: Event) => { if (!menu.contains(event.target as Node)) place(); };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function moveFocus(event: ReactKeyboardEvent, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
      optionRefs.current[next]?.focus();
    }
  }

  return (
    <div className={`vs-dropdownSelect ${className}`} data-dropdown-select={testId}>
      <button
        ref={triggerRef}
        type="button"
        className="vs-dropdownTrigger"
        aria-label={`${label}: ${selected?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      <div
        ref={menuRef}
        className="vs-dropdownMenu"
        popover="auto"
        onToggle={(event) => { if (!event.currentTarget.matches(":popover-open")) setOpen(false); }}
        onKeyDown={(event) => moveFocus(event, optionRefs.current.indexOf(event.target as HTMLButtonElement))}
      >
        <div id={`${id}-options`} className="vs-dropdownOptions" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`vs-dropdownOption${index === selectedIndex ? " is-selected" : ""}`}
              onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}
            >
              <span>{option.label}</span>{index === selectedIndex && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
