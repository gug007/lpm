import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { SmileIcon } from "./icons";
import { EmojiPickerPanel } from "./EmojiPickerPanel";
import { useEventListener } from "../hooks/useEventListener";
import { insertAtSelection } from "../insertAtSelection";

const PANEL_GAP_PX = 8;
const PANEL_MIN_WIDTH_PX = 300;
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

export function EmojiPickerButton({
  inputRef,
  value,
  onChange,
  size = "sm",
}: EmojiPickerButtonProps) {
  // Keep the picker open while clicking back into the input so several emoji
  // can be inserted in a row.
  const { open, setOpen, toggleRef, panelRef, panelStyle } = useEmojiPanel(
    inputRef,
    [inputRef],
  );
  const { button: sizeButtonClass, icon: iconSize } = SIZES[size];

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
      <EmojiPanelPortal
        open={open}
        panelStyle={panelStyle}
        panelRef={panelRef}
        onSelect={handleSelect}
      />
    </>
  );
}

interface EmojiSlotButtonProps {
  // Anchors the panel below this input and matches its width.
  inputRef: RefObject<HTMLInputElement | null>;
  // The currently selected emoji, or "" when none is set yet.
  value: string;
  onSelect: (emoji: string) => void;
  size?: Size;
  // Shown when no emoji is set yet. Defaults to a smiley.
  placeholder?: ReactNode;
  // Fill the relative parent (a standalone slot) instead of the default
  // left-anchored overlay used inside a composer input.
  fill?: boolean;
}

/**
 * A leading emoji slot: shows the chosen emoji (or a placeholder) and opens the
 * picker to set a single dedicated emoji — unlike EmojiPickerButton, it replaces
 * the value rather than inserting into the input's text.
 */
export function EmojiSlotButton({
  inputRef,
  value,
  onSelect,
  size = "md",
  placeholder,
  fill = false,
}: EmojiSlotButtonProps) {
  const { open, setOpen, toggleRef, panelRef, panelStyle } = useEmojiPanel(inputRef);
  const { icon: iconSize } = SIZES[size];

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={value ? "Change emoji" : "Pick emoji"}
        aria-pressed={open}
        className={`grid place-items-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] ${
          fill ? "absolute inset-0" : "absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2"
        } ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        {value ? (
          <span className="text-[18px] leading-none">{value}</span>
        ) : (
          <span className="flex items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {placeholder ?? <SmileIcon size={iconSize} />}
          </span>
        )}
      </button>
      <EmojiPanelPortal
        open={open}
        panelStyle={panelStyle}
        panelRef={panelRef}
        onSelect={handleSelect}
      />
    </>
  );
}

// Shared open/anchor/dismiss machinery for the two emoji triggers above.
function useEmojiPanel(
  inputRef: RefObject<HTMLInputElement | null>,
  extraDismissRefs: ReadonlyArray<RefObject<HTMLElement | null>> = [],
) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useAnchorBelow(inputRef, open);

  useDismissOnOutsideClick(open, () => setOpen(false), [
    panelRef,
    toggleRef,
    ...extraDismissRefs,
  ]);
  useDismissOnEscape(open, () => {
    setOpen(false);
    inputRef.current?.focus();
  });

  return { open, setOpen, toggleRef, panelRef, panelStyle };
}

function EmojiPanelPortal({
  open,
  panelStyle,
  panelRef,
  onSelect,
}: {
  open: boolean;
  panelStyle: CSSProperties | null;
  panelRef: RefObject<HTMLDivElement | null>;
  onSelect: (emoji: string) => void;
}) {
  if (!open || !panelStyle) return null;
  return createPortal(
    <div ref={panelRef} style={panelStyle} className={PANEL_CLASS}>
      <EmojiPickerPanel onSelect={onSelect} />
    </div>,
    document.body,
  );
}

function computePanelStyle(
  anchorRect: DOMRect,
  viewportWidth: number,
): CSSProperties {
  const width = clamp(anchorRect.width, PANEL_MIN_WIDTH_PX, PANEL_MAX_WIDTH_PX);
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
