import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { TERMINAL_FONT_FAMILY, terminalFontStack } from "./terminal-utils";

const PANEL_WIDTH = 264;
const DEFAULT_LABEL = "Default";
const SAMPLE = "Il1 0O";

interface TerminalFontSelectProps {
  value?: string;
  options: string[];
  onChange: (family?: string) => void;
}

export function TerminalFontSelect({ value, options, onChange }: TerminalFontSelectProps) {
  const [open, setOpen] = useState(false);
  const families: (string | undefined)[] = [undefined, ...options];
  const selectedIndex = Math.max(0, value ? families.indexOf(value) : 0);
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const { triggerRef, panelRef, style } = useAnchoredPanel<
    HTMLButtonElement,
    HTMLDivElement
  >({ open, onClose: () => setOpen(false), width: PANEL_WIDTH, flip: true });

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

  const label = (family?: string) => family ?? DEFAULT_LABEL;
  const stack = (family?: string) =>
    family ? terminalFontStack(family) : TERMINAL_FONT_FAMILY;

  const pick = (index: number) => {
    onChange(families[index]);
    setOpen(false);
  };

  const jumpTo = (char: string) => {
    const c = char.toLowerCase();
    for (let step = 1; step <= families.length; step++) {
      const i = (highlighted + step) % families.length;
      if (label(families[i]).toLowerCase().startsWith(c)) {
        setHighlighted(i);
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
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(families.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(families.length - 1);
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
        aria-label="Terminal font"
        className="z-[70] max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
      >
        {families.map((family, i) => {
          const active = i === selectedIndex;
          return (
            <button
              key={label(family)}
              type="button"
              role="option"
              aria-selected={active}
              data-index={i}
              onClick={() => pick(i)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                i === highlighted
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{ fontFamily: stack(family) }}
              >
                {label(family)}
              </span>
              <span
                aria-hidden
                className="shrink-0 text-[11px] text-[var(--text-muted)]"
                style={{ fontFamily: stack(family) }}
              >
                {SAMPLE}
              </span>
              <span className="flex w-3.5 shrink-0 justify-end text-[var(--accent-green)]">
                {active && <Check size={13} />}
              </span>
            </button>
          );
        })}
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
        aria-label="Terminal font"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className="flex w-48 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-2.5 pr-2 text-xs text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-green)] focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/30"
      >
        <span
          className="min-w-0 flex-1 truncate text-left"
          style={{ fontFamily: stack(value) }}
        >
          {label(value)}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </>
  );
}
