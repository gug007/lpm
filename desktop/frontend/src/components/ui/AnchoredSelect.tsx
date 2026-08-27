import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";

interface AnchoredSelectProps<V> {
  value: V;
  options: V[];
  onChange: (value: V) => void;
  label: (value: V) => string;
  ariaLabel: string;
  renderOption?: (value: V) => ReactNode;
  renderValue?: (value: V) => ReactNode;
  // Fires with the highlighted option while the list is open (hover or arrow
  // keys) and null once it closes — for live previews behind the panel.
  onHighlightChange?: (value: V | null) => void;
  panelWidth?: number;
  triggerClassName?: string;
}

// Custom listbox replacement for a native <select>: theme-token styling, per-
// option custom rendering, and the native keyboard model (arrows, Home/End,
// Enter/Space, Escape, type-ahead).
export function AnchoredSelect<V>({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  renderOption,
  renderValue,
  onHighlightChange,
  panelWidth = 264,
  triggerClassName = "w-48",
}: AnchoredSelectProps<V>) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.indexOf(value));
  const [highlighted, setHighlighted] = useState(selectedIndex);

  const close = () => {
    setOpen(false);
    onHighlightChange?.(null);
  };

  const { triggerRef, panelRef, style } = useAnchoredPanel<
    HTMLButtonElement,
    HTMLDivElement
  >({ open, onClose: close, width: panelWidth, flip: true });

  useEffect(() => {
    if (open) setHighlighted(selectedIndex);
    // Reset only on open; a value change while closed re-syncs via selectedIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !style) return;
    panelRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, style, highlighted, panelRef]);

  const highlight = (index: number) => {
    setHighlighted(index);
    onHighlightChange?.(options[index]);
  };

  const pick = (index: number) => {
    onChange(options[index]);
    close();
  };

  const jumpTo = (char: string) => {
    const c = char.toLowerCase();
    for (let step = 1; step <= options.length; step++) {
      const i = (highlighted + step) % options.length;
      if (label(options[i]).toLowerCase().startsWith(c)) {
        highlight(i);
        return;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(Math.min(options.length - 1, highlighted + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(Math.max(0, highlighted - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      highlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      highlight(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(highlighted);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      jumpTo(e.key);
    }
  };

  const menu =
    open &&
    style &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        role="listbox"
        aria-label={ariaLabel}
        className="z-[70] max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
      >
        {options.map((option, i) => (
          <button
            key={label(option)}
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            data-index={i}
            onClick={() => pick(i)}
            onMouseEnter={() => highlight(i)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              i === highlighted
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {renderOption ? (
              renderOption(option)
            ) : (
              <span className="min-w-0 flex-1 truncate">{label(option)}</span>
            )}
            <span className="flex w-3.5 shrink-0 justify-end text-[var(--accent-green)]">
              {i === selectedIndex && <Check size={13} />}
            </span>
          </button>
        ))}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-2.5 pr-2 text-xs text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-green)] focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/30 ${triggerClassName}`}
      >
        {renderValue ? (
          renderValue(value)
        ) : (
          <span className="min-w-0 flex-1 truncate text-left">{label(value)}</span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </>
  );
}
