import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import { STATUS_LINE_SEGMENT_LABELS } from "./statusLineEditorOptions";
import { StatusLineSegmentInspector } from "./StatusLineSegmentInspector";
import type { Segment } from "./statusLineTypes";

const PANEL_WIDTH = 400;

export function StatusLineSegmentPopover({
  segment,
  open,
  disabled,
  canRemove,
  onToggle,
  onUpdate,
  onRemove,
  onClose,
}: {
  segment: Segment;
  open: boolean;
  disabled: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Segment>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const label =
    segment.id === "text"
      ? segment.text || "Custom text"
      : STATUS_LINE_SEGMENT_LABELS[segment.id];
  const id = `${useId().replaceAll(":", "")}-status-line-segment-settings`;
  const headingId = `${id}-heading`;
  const { triggerRef, panelRef, style } = useAnchoredPanel<
    HTMLButtonElement,
    HTMLDivElement
  >({
    open,
    onClose,
    width: PANEL_WIDTH,
    side: "below",
    align: "left",
    flip: true,
  });

  useOverlay(open);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open, triggerRef]);

  useEffect(() => {
    if (disabled && open) onClose();
  }, [disabled, onClose, open]);

  useEffect(() => {
    if (!open) return;
    const closeIfAnchorLeavesViewport = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (
        !rect ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        onClose();
      }
    };

    closeIfAnchorLeavesViewport();
    window.addEventListener("resize", closeIfAnchorLeavesViewport);
    window.addEventListener("scroll", closeIfAnchorLeavesViewport, true);
    return () => {
      window.removeEventListener("resize", closeIfAnchorLeavesViewport);
      window.removeEventListener("scroll", closeIfAnchorLeavesViewport, true);
    };
  }, [onClose, open, triggerRef]);

  const closeAndFocus = () => {
    onClose();
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={`Edit ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`Edit ${label}`}
        onClick={onToggle}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--accent-blue)]/10 hover:text-[var(--accent-blue-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-35 ${
          open
            ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue-text)]"
            : ""
        }`}
      >
        <Pencil size={11} />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal={false}
            aria-labelledby={headingId}
            style={style}
            className="z-[100] overflow-y-auto rounded-xl shadow-2xl"
          >
            <StatusLineSegmentInspector
              headingId={headingId}
              segment={segment}
              disabled={disabled}
              canRemove={canRemove}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onClose={closeAndFocus}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
