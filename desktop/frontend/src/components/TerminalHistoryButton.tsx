import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "../store/overlay";
import { ClipboardListIcon } from "./icons";
import { TerminalHistoryPopover } from "./TerminalHistoryPopover";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

interface TerminalHistoryButtonProps {
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  // Loads the chosen message back into the composer for editing/resending.
  onPick: (text: string, images: Record<string, string>) => void;
  // Fires the chosen message straight at the terminal, skipping the composer.
  // Optional: dialog composers have no terminal, so they omit it (no send button).
  onSend?: (text: string, images: Record<string, string>) => void;
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
}: TerminalHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const lastGeom = useRef<{ top: number; left: number; right: number } | null>(null);

  useOverlay(open);

  const close = () => {
    setOpen(false);
    lastGeom.current = null;
  };

  // The popover spans the composer input box (full width), so it's anchored to
  // that box's rect rather than the button. Skip the state update (and
  // re-render) when the box hasn't moved — otherwise scrolling the history list,
  // which a capture-phase scroll listener also sees, would churn.
  const reposition = () => {
    const r = btnRef.current?.closest("[data-composer-box]")?.getBoundingClientRect();
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
  // live outside popRef's subtree) count as inside. Escape is captured so it
  // doesn't also close the composer, but defers to an open child menu or an
  // active folder-name input so it dismisses the topmost layer first.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (btnRef.current?.contains(t) || t.closest?.("[data-history-overlay]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-history-menu]")) return;
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
      <Tooltip content="Recent messages" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          ref={btnRef}
          type="button"
          onClick={toggleOpen}
          aria-label="Message history"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            open
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <ClipboardListIcon />
        </button>
      </Tooltip>

      {open &&
        rect &&
        createPortal(
          <TerminalHistoryPopover
            containerRef={popRef}
            style={style}
            terminalId={terminalId}
            projectName={projectName}
            terminalLabel={terminalLabel}
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
