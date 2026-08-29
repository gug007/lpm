import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { LABEL, OptionCard, noteClass, type OptionTone } from "./OptionCard";
import { SURFACE_TOKENS } from "./surfaces";

export interface SelectOption {
  id: string;
  mark: ReactNode;
  title: string;
  note: string;
  mono?: boolean;
  disabled?: boolean;
}

interface OptionSelectProps {
  label: string;
  tone: OptionTone;
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
}

// Focus is ink, not the accent: the open list is marked in accent blue, and a
// focus ring in the same colour one pixel outside it says nothing new.
const TRIGGER =
  "flex w-full min-w-0 items-start gap-[7px] rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_16%,transparent)] transition-[background-color,box-shadow] hover:bg-[var(--tk-hover)] focus:outline-none focus-visible:outline-[1.5px] focus-visible:outline-offset-[2px] focus-visible:outline-[var(--text-primary)]";

const PANEL =
  "z-[60] flex flex-col gap-1.5 overflow-y-auto rounded-[var(--tk-radius)] border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 shadow-[var(--tk-lift)]";

// The answer collapsed into the field itself — title over the sentence that
// explains it, exactly as the option reads in the open list. The choice costs
// one row of the form instead of four, and nothing about it moves as it opens.
export function OptionSelect({ label, tone, options, value, onChange }: OptionSelectProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  // A re-scan can orphan the chosen id for a beat; falling back to the first
  // option keeps the trigger readable until the parent re-picks.
  const chosen = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const [active, setActive] = useState(chosen);
  const [width, setWidth] = useState(320);
  const selected = options[chosen];

  const close = () => setOpen(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: close,
    width,
    align: "left",
    flip: true,
  });

  // Measured before the panel opens, in the same batch, so it is laid out at
  // the field's width on its first frame rather than jumping to it.
  const show = (trigger: HTMLElement) => {
    setWidth(trigger.getBoundingClientRect().width || width);
    setActive(chosen);
    setOpen(true);
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let hop = 1; hop <= options.length; hop++) {
      const next = (((from + dir * hop) % options.length) + options.length) % options.length;
      if (!options[next].disabled) return next;
    }
    return from;
  };

  const pick = (index: number) => {
    if (options[index].disabled) return;
    onChange(options[index].id);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show(e.currentTarget);
      }
      return;
    }
    // Escape belongs to the open list, not to the dialog hosting it.
    e.stopPropagation();
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(step(active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(step(e.key === "Home" ? options.length - 1 : 0, e.key === "Home" ? 1 : -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={`${ids}-label`} className={LABEL}>
        {label}
      </span>
      <button
        ref={triggerRef}
        id={`${ids}-trigger`}
        type="button"
        role="combobox"
        aria-controls={`${ids}-list`}
        aria-expanded={open}
        aria-labelledby={`${ids}-label ${ids}-trigger`}
        aria-activedescendant={open ? `${ids}-${active}` : undefined}
        onClick={(e) => (open ? close() : show(e.currentTarget))}
        onKeyDown={onKeyDown}
        className={TRIGGER}
      >
        {selected?.mark}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[11.5px] text-[var(--text-primary)]">
            {selected?.title}
          </span>
          <span className={noteClass(selected?.mono)}>{selected?.note}</span>
        </span>
        <ChevronDown
          size={11}
          className={`mt-[3px] shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        style &&
        createPortal(
          // Portalled clear of the dialog's scrolling body, so it carries the
          // pane's surface tokens itself — an undefined custom property paints
          // nothing at all.
          <div
            ref={panelRef}
            id={`${ids}-list`}
            role="listbox"
            aria-label={label}
            style={{ ...SURFACE_TOKENS, ...style }}
            className={PANEL}
          >
            {options.map((option, index) => (
              <OptionCard
                key={option.id}
                id={`${ids}-${index}`}
                on={index === chosen}
                active={index === active}
                tone={tone}
                mark={option.mark}
                title={option.title}
                note={option.note}
                mono={option.mono}
                disabled={option.disabled}
                onPick={() => pick(index)}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
