import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Palette } from "lucide-react";
import { XIcon } from "./icons";
import { useEventListener } from "../hooks/useEventListener";
import { useOverlay } from "../store/overlay";
import {
  ACTION_COLOR_NAMES,
  actionAccentColor,
  actionColorLabel,
  actionColorVariants,
  isNamedActionColor,
} from "../actionColors";

const DEEP_COLORS = actionColorVariants(ACTION_COLOR_NAMES, "deep");

const RAINBOW =
  "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)";

const PANEL_GAP_PX = 8;

// Selection ring via outline so the gap stays transparent — a box-shadow gap
// would paint an opaque disc over the translucent panel.
function selectionStyle(color: string): CSSProperties {
  return { outline: `2px solid ${color}`, outlineOffset: "2px" };
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
 * custom color (native picker or typed CSS color). The popover is portaled to
 * the body so the wizard's scroll/overflow containers can't clip it.
 */
export function ActionColorButton({ value, onChange }: ActionColorButtonProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useAnchorBelowRight(toggleRef, open);
  const isCustom = !!value && !isNamedActionColor(value);
  const [customDraft, setCustomDraft] = useState(isCustom ? value : "");

  // Park the in-pane webview so it can't float over the open popover.
  useOverlay(open);

  useEffect(() => {
    if (open) setCustomDraft(isCustom ? value : "");
  }, [open, value, isCustom]);

  useEventListener(
    "mousedown",
    (e) => {
      const target = e.target as Node;
      if (toggleRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    },
    document,
    open,
  );

  // Capture-phase Escape so the popover closes before the host modal does.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    },
    document,
    open,
    true,
  );

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
    <div className="absolute right-2 top-1/2 -translate-y-1/2">
      <button
        ref={toggleRef}
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
      {open &&
        panelStyle &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="z-[70] w-max origin-top-right overflow-y-auto rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-secondary)_86%,transparent)] p-3 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.4),0_2px_10px_-2px_rgba(0,0,0,0.2)] backdrop-blur-xl motion-safe:animate-[color-pop-in_130ms_ease-out]"
          >
            <SwatchGrid values={ACTION_COLOR_NAMES} selected={value} onPick={pick} />
            <SwatchGrid
              values={DEEP_COLORS}
              selected={value}
              onPick={pick}
              className="mt-2"
            />
            <div className="mt-3 flex items-center gap-1.5">
              <label
                title="Custom color"
                className="relative grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full transition-transform duration-100 hover:scale-[1.15]"
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={
                    isCustom
                      ? {
                          background: actionAccentColor(value),
                          ...selectionStyle(actionAccentColor(value)!),
                        }
                      : { background: RAINBOW }
                  }
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
                className="w-24 rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--bg-primary)_65%,transparent)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => pick("")}
                  aria-label="Clear color"
                  title="Clear color"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
                >
                  <XIcon />
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Pin the panel's top-right corner just below the trigger button, in fixed
// (viewport) coordinates so no scroll/overflow ancestor can clip it.
function useAnchorBelowRight(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        position: "fixed",
        top: rect.bottom + PANEL_GAP_PX,
        right: window.innerWidth - rect.right,
        maxHeight: window.innerHeight - rect.bottom - PANEL_GAP_PX * 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef]);

  return style;
}

function SwatchGrid({
  values,
  selected,
  onPick,
  className = "",
}: {
  values: readonly string[];
  selected: string;
  onPick: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-7 gap-1 ${className}`}>
      {values.map((value) => (
        <Swatch
          key={value}
          color={actionAccentColor(value)!}
          selected={selected === value}
          onClick={() => onPick(value)}
          label={actionColorLabel(value)}
        />
      ))}
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
      className="grid h-6 w-6 place-items-center rounded-full transition-transform duration-100 hover:scale-[1.15]"
    >
      <span
        className="h-4 w-4 rounded-full"
        style={{
          backgroundColor: color,
          ...(selected ? selectionStyle(color) : undefined),
        }}
      />
    </button>
  );
}
