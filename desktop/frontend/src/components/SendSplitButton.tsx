import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ChevronUpIcon, PencilIcon, SendIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

interface SendSplitButtonProps {
  // Nothing to send (empty/whitespace) — disables both the send and draft paths.
  disabled: boolean;
  // A composer action transform is running; the field is locked, so hold off.
  busy: boolean;
  onSend: () => void;
  onSaveDraft: () => void;
}

const MENU_WIDTH = 172;

// The composer's send control: a split button whose primary half sends the
// prompt (unchanged ↵ behaviour) and whose caret half opens a one-item menu to
// save the prompt as a draft instead. The menu is anchored above the button
// (the composer sits at the bottom of the pane) and portaled so the composer's
// rounded, clipping ancestors can't cut it off.
export function SendSplitButton({ disabled, busy, onSend, onSaveDraft }: SendSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const inert = disabled || busy;
  // Shared anchored-panel infra owns the upward positioning, viewport clamp, and
  // outside-click dismiss — the sibling SplitButton uses it the same way.
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: MENU_WIDTH,
    side: "above",
  });

  useOverlay(open);

  // Escape closes the menu; captured and stopped so it doesn't also blur the
  // composer (the hook only covers outside-click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // The menu can't outlive the enabled state (e.g. the field is cleared while open).
  useEffect(() => {
    if (inert && open) setOpen(false);
  }, [inert, open]);

  const glow: CSSProperties | undefined = inert
    ? undefined
    : { boxShadow: "0 2px 12px -2px color-mix(in srgb, var(--accent-blue) 60%, transparent)" };

  // One segmented pill in both states so the control never reads as two loose
  // icons: a solid accent send half and a slightly recessed caret half when
  // live; a quiet neutral shell when there's nothing to send.
  const container = inert ? "bg-[var(--bg-active)]/60" : "bg-[var(--accent-blue)]";
  const divider = inert ? "bg-[var(--border)]" : "bg-[var(--bg-primary)]/20";

  return (
    <div
      ref={triggerRef}
      className={`flex items-center rounded-lg transition-colors duration-150 ${container}`}
      style={glow}
    >
      <Tooltip content="Send  ·  ↵" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onSend();
          }}
          disabled={inert}
          aria-label="Send"
          className={`flex h-7 items-center justify-center rounded-l-lg pl-2.5 pr-2 transition-colors [&>svg]:rotate-45 ${
            inert
              ? "text-[var(--text-muted)]"
              : "text-[var(--bg-primary)] hover:bg-black/10 active:bg-black/20"
          }`}
        >
          <SendIcon />
        </button>
      </Tooltip>
      <span className={`h-3.5 w-px ${divider}`} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={inert}
        aria-label="More send options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 items-center justify-center rounded-r-lg pl-1.5 pr-2 transition-colors [&>svg]:h-3 [&>svg]:w-3 ${
          inert
            ? "text-[var(--text-muted)]"
            : `text-[var(--bg-primary)]/70 hover:bg-black/10 hover:text-[var(--bg-primary)] ${
                open ? "bg-black/10 text-[var(--bg-primary)]" : ""
              }`
        }`}
      >
        <ChevronUpIcon />
      </button>

      {open &&
        style &&
        createPortal(
          <div ref={panelRef} role="menu" style={style} className={`z-[80] ${MENU_PANEL_CLASS}`}>
            <ContextMenuItem
              label="Save as draft"
              icon={<PencilIcon size={13} />}
              shortcut="⌘↵"
              onClick={() => {
                setOpen(false);
                onSaveDraft();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
