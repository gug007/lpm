import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { SmileIcon } from "./icons";
import { EmojiPickerPanel } from "./EmojiPickerPanel";
import { useEventListener } from "../hooks/useEventListener";
import { insertAtSelection } from "../insertAtSelection";

const PANEL_GAP_PX = 8;
const PANEL_MAX_WIDTH_PX = 360;
const VIEWPORT_MARGIN_PX = 8;
const PANEL_Z_INDEX = "z-[70]";

const TOGGLE_BASE_CLASS =
  "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-md transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const TOGGLE_OPEN_CLASS = "bg-[var(--bg-hover)] text-[var(--text-primary)]";
const TOGGLE_CLOSED_CLASS = "text-[var(--text-muted)]";

const PANEL_CLASS = `${PANEL_Z_INDEX} overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl`;

type Size = "sm" | "md";

const SIZES: Record<Size, { button: string; icon: number }> = {
  sm: { button: "right-1.5 h-7 w-7", icon: 16 },
  md: { button: "right-2 h-8 w-8", icon: 18 },
};

interface EmojiPickerButtonProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  size?: Size;
}

/**
 * Toggle button + portaled emoji picker, positioned below the input it
 * targets. The parent owns the input and the value; this component only
 * inserts text at the current cursor and refocuses the input.
 */
export function EmojiPickerButton({
  inputRef,
  value,
  onChange,
  size = "sm",
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useAnchorBelow(inputRef, open);
  const { button: sizeButtonClass, icon: iconSize } = SIZES[size];

  useDismissOnOutsideClick(open, () => setOpen(false), [
    panelRef,
    toggleRef,
    inputRef,
  ]);

  useDismissOnEscape(open, () => {
    setOpen(false);
    inputRef.current?.focus();
  });

  const handleSelect = (emoji: string) => {
    const { value: next, cursor } = insertAtSelection(
      inputRef.current,
      value,
      emoji,
    );
    onChange(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  const toggleClass = [
    TOGGLE_BASE_CLASS,
    sizeButtonClass,
    open ? TOGGLE_OPEN_CLASS : TOGGLE_CLOSED_CLASS,
  ].join(" ");

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert emoji"
        aria-pressed={open}
        className={toggleClass}
      >
        <SmileIcon size={iconSize} />
      </button>
      {open && panelStyle &&
        createPortal(
          <div ref={panelRef} style={panelStyle} className={PANEL_CLASS}>
            <EmojiPickerPanel onSelect={handleSelect} />
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Fixed-position style sitting PANEL_GAP_PX below the anchor. Width matches
 * the anchor up to PANEL_MAX_WIDTH_PX; the panel is right-aligned to the
 * anchor so it stays near the toggle on wide inputs, then clamped into the
 * viewport.
 */
function computePanelStyle(
  anchorRect: DOMRect,
  viewportWidth: number,
): CSSProperties {
  const width = Math.min(anchorRect.width, PANEL_MAX_WIDTH_PX);
  const preferredLeft = anchorRect.right - width;
  const maxLeft = viewportWidth - VIEWPORT_MARGIN_PX - width;
  const left = clamp(preferredLeft, VIEWPORT_MARGIN_PX, maxLeft);
  return {
    position: "fixed",
    top: anchorRect.bottom + PANEL_GAP_PX,
    left,
    width,
  };
}

function useAnchorBelow(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      setStyle(computePanelStyle(el.getBoundingClientRect(), window.innerWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef]);

  return style;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Closes when a mousedown lands outside every provided element. */
function useDismissOnOutsideClick(
  open: boolean,
  onDismiss: () => void,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
) {
  useEventListener(
    "mousedown",
    (e) => {
      const target = e.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    },
    document,
    open,
  );
}

/** Capture-phase Escape so the picker closes before any parent modal does. */
function useDismissOnEscape(open: boolean, onDismiss: () => void) {
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onDismiss();
    },
    document,
    open,
    true,
  );
}
