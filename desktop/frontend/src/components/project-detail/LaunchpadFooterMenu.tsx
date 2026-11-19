import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { useDismissOnEscape } from "../../hooks/useDismissOnEscape";
import { useOverlay } from "../../store/overlay";

interface LaunchpadFooterMenuProps {
  width: number;
  // The panel's name for assistive tech.
  label: string;
  trigger: ReactNode;
  triggerLabel?: string;
  title?: string;
  triggerClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}

// A pill beside the launchpad's Start that opens its panel below it.
export function LaunchpadFooterMenu({
  width,
  label,
  trigger,
  triggerLabel,
  title,
  triggerClassName = "",
  panelClassName = "",
  children,
}: LaunchpadFooterMenuProps) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width,
    side: "below",
    align: "right",
    flip: true,
  });
  useOverlay(open);
  useDismissOnEscape(open, () => setOpen(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] leading-none transition-colors hover:bg-[var(--bg-hover)] ${
          open ? "bg-[var(--bg-hover)]" : ""
        } ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="dialog"
            aria-label={label}
            className={`z-[80] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl ${panelClassName}`}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
