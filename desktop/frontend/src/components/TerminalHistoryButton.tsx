import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../store/overlay";
import type { ComposerToolPresentation } from "../composerTools";
import { HistoryIcon } from "./icons";
import { TerminalHistoryPopover } from "./TerminalHistoryPopover";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

export interface TerminalHistoryButtonProps {
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  // Loads the chosen message back into the composer for editing/resending.
  onPick: (text: string, images: Record<string, string>) => void;
  // Fires the chosen message straight at the terminal, skipping the composer.
  // Optional: dialog composers have no terminal, so they omit it (no send button).
  onSend?: (text: string, images: Record<string, string>) => void;
  // Collection the popover opens on; defaults to the unfiltered "All" view.
  initialCollection?: string;
  icon?: ReactNode;
  tooltip?: string;
  ariaLabel?: string;
  // The composer box the popover spans. The button finds it by walking up
  // when it sits inside; a row in a portaled menu has to be handed it.
  boxRef?: RefObject<HTMLElement | null>;
  // Offer the prompts waiting to be sent later. Only a terminal's own input can
  // take one back to edit, so dialog inputs leave it off.
  scheduled?: boolean;
}

const GAP = 10;
const MARGIN = 12;
const MAX_HEIGHT = 460;

export function TerminalHistoryButton({
  terminalId,
  projectName,
  terminalLabel,
  onPick,
  onSend,
  initialCollection,
  icon = <HistoryIcon />,
  tooltip = "Recent messages",
  ariaLabel = "Message history",
  boxRef,
  scheduled = false,
  variant = "button",
  onOpenChange,
}: TerminalHistoryButtonProps & ComposerToolPresentation) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The trigger: the icon button, or the row's box when the button is a row.
  const triggerRef = useRef<HTMLElement | null>(null);
  const setTrigger = (el: HTMLElement | null) => {
    triggerRef.current = el;
  };
  const popRef = useRef<HTMLDivElement>(null);
  const lastGeom = useRef<{ top: number; left: number; right: number } | null>(null);

  useOverlay(open);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const close = () => {
    setOpen(false);
    lastGeom.current = null;
  };

  // The popover spans the composer input box (full width), so it's anchored to
  // that box's rect rather than the button. Skip the state update (and
  // re-render) when the box hasn't moved — otherwise scrolling the history list,
  // which a capture-phase scroll listener also sees, would churn.
  const reposition = () => {
    const box = boxRef?.current ?? triggerRef.current?.closest("[data-composer-box]");
    const r = box?.getBoundingClientRect();
    if (!r) return;
    const prev = lastGeom.current;
    if (prev && prev.top === r.top && prev.left === r.left && prev.right === r.right) return;
    lastGeom.current = { top: r.top, left: r.left, right: r.right };
    setRect(r);
  };

  const toggleOpen = () => {
    if (open) {
      close();
      return;
    }
    reposition();
    setOpen(true);
  };

  // The popover is portaled and fixed-positioned (so the composer's
  // overflow-hidden ancestors can't clip it); keep it pinned to the composer box.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  // Outside-click and Escape close the popover. The trigger button and anything
  // marked data-history-overlay (the popover and its portaled child menus, which
  // live outside popRef's subtree) count as inside; a hosted modal
  // (data-modal-overlay) does too, so its backdrop dismisses the modal rather
  // than the popover. Escape is captured so it doesn't also close the composer,
  // but defers to an open child menu, a hosted confirm dialog, or an active
  // folder-name input so it dismisses the topmost layer first.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (
        triggerRef.current?.contains(t) ||
        t.closest?.("[data-history-overlay]") ||
        t.closest?.("[data-modal-overlay]")
      )
        return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-history-menu]")) return;
      if (document.querySelector("[data-modal-overlay]")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.folderInput !== undefined) return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const style: CSSProperties | undefined = rect
    ? {
        position: "fixed",
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + GAP,
        maxHeight: Math.max(160, Math.min(MAX_HEIGHT, rect.top - GAP - MARGIN)),
      }
    : undefined;

  return (
    <>
      {variant === "row" ? (
        <div ref={setTrigger} className="min-w-0 flex-1">
          <ContextMenuItem label={tooltip} icon={icon} expanded={open} onClick={toggleOpen} />
        </div>
      ) : (
      <Tooltip content={tooltip} delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          ref={setTrigger}
          type="button"
          onClick={toggleOpen}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            open
              ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]"
              : "text-[var(--composer-fg-muted)] hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)]"
          }`}
        >
          {icon}
        </button>
      </Tooltip>
      )}

      {open &&
        rect &&
        createPortal(
          <TerminalHistoryPopover
            containerRef={popRef}
            style={style}
            terminalId={terminalId}
            projectName={projectName}
            terminalLabel={terminalLabel}
            initialCollection={initialCollection}
            scheduled={scheduled}
            onClose={close}
            onPick={(text, images) => {
              onPick(text, images);
              close();
            }}
            onSend={
              onSend
                ? (text, images) => {
                    onSend(text, images);
                    close();
                  }
                : undefined
            }
          />,
          document.body,
        )}
    </>
  );
}
