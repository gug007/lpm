import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { XIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  ACTION_COLOR_NAMES,
  actionAccentColor,
  isNamedActionColor,
} from "../actionColors";

const RAINBOW =
  "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)";

// Double ring: a bg-colored gap, then the color itself — reads as selection on
// any swatch color in either theme.
function selectionRing(color: string): string {
  return `0 0 0 2px var(--bg-secondary), 0 0 0 4px ${color}`;
}

function isValidCssColor(value: string): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return CSS.supports("color", value);
}

// The native color input only understands #rrggbb, so feed it a hex-ish seed
// even when the custom value is a keyword or shorthand.
function toColorInputValue(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#8b5cf6";
}

interface ActionColorButtonProps {
  // The selected color: a named accent, any CSS color, or "" for default styling.
  value: string;
  onChange: (next: string) => void;
}

/**
 * A trailing color slot for the action wizard's name field: shows the chosen
 * accent as a dot and opens a swatch popover with the named palette plus a
 * custom color (native picker or typed CSS color).
 */
export function ActionColorButton({ value, onChange }: ActionColorButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const isCustom = !!value && !isNamedActionColor(value);
  const [customDraft, setCustomDraft] = useState(isCustom ? value : "");

  useEffect(() => {
    if (open) setCustomDraft(isCustom ? value : "");
  }, [open, value, isCustom]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const applyCustomDraft = () => {
    const next = customDraft.trim();
    if (!next || next === value) return;
    if (!isValidCssColor(next)) return;
    onChange(next);
  };

  return (
    <div ref={wrapRef} className="absolute right-2 top-1/2 -translate-y-1/2">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={value ? "Change color" : "Pick color"}
        aria-pressed={open}
        className={`grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        {value ? (
          <span
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: actionAccentColor(value) }}
          />
        ) : (
          <Palette size={16} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-max rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-2xl">
          <div className="grid grid-cols-6 gap-1">
            {ACTION_COLOR_NAMES.map((name) => (
              <Swatch
                key={name}
                color={actionAccentColor(name)!}
                selected={value === name}
                onClick={() => pick(name)}
                label={name}
              />
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--border)] pt-2.5">
            <label
              title="Custom color"
              className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110"
            >
              <span
                className="h-4 w-4 rounded-full"
                style={{
                  background: isCustom ? actionAccentColor(value) : RAINBOW,
                  boxShadow: isCustom
                    ? selectionRing(actionAccentColor(value)!)
                    : undefined,
                }}
              />
              <input
                type="color"
                value={toColorInputValue(value)}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onBlur={applyCustomDraft}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                applyCustomDraft();
              }}
              placeholder="#8b5cf6"
              spellCheck={false}
              className="w-24 rounded-md border border-transparent bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
            />
            {value && (
              <button
                type="button"
                onClick={() => pick("")}
                aria-label="Clear color"
                title="Clear color"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
              >
                <XIcon />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110"
    >
      <span
        className="h-4 w-4 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: selected ? selectionRing(color) : undefined,
        }}
      />
    </button>
  );
}
