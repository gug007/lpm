import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ZoneRows } from "../types";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useEventListener } from "../hooks/useEventListener";
import { useOverlay } from "../store/overlay";
import { GripVerticalIcon, MousePointerClickIcon, PlusIcon, SparkleIcon, TerminalIcon } from "./icons";
import { NewActionChooser } from "./NewActionChooser";
import { Tooltip } from "./ui/Tooltip";

const PANEL_WIDTH = 260;

interface AddActionButtonProps {
  onAddAction: () => void;
  onAddZone: (rows: ZoneRows) => void;
}

export function AddActionButton({ onAddAction, onAddZone }: AddActionButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: "below",
    align: "right",
  });
  useOverlay(open);
  // Capture-phase Escape so it closes the chooser alone, not also a fullscreen
  // pane underneath. The chooser took focus when it opened, so give it back.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    },
    document,
    open,
    true,
  );
  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={triggerRef} className="shrink-0">
      <Tooltip
        content={
          <span className="flex flex-col">
            <span className="flex items-center gap-2.5">
              <span className="magic-ring h-6 w-6 shrink-0 rounded-md p-[1px]">
                <span className="flex h-full w-full items-center justify-center rounded-[5px] bg-[var(--bg-secondary)] text-[color-mix(in_srgb,#a855f7_60%,var(--text-muted))]">
                  <PlusIcon />
                </span>
              </span>
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold leading-tight text-[var(--text-primary)]">Create action</span>
                <span className="mt-0.5 text-[11.5px] leading-tight text-[var(--text-muted)]">One-click shortcuts for the things you run often</span>
              </span>
            </span>
            <span className="mt-3 flex flex-col gap-2">
              <span className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
                  <TerminalIcon />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium leading-tight text-[var(--text-primary)]">Run commands</span>
                  <span className="mt-0.5 text-[11.5px] leading-tight text-[var(--text-muted)]">Tests, builds, deploys, migrations, log tails</span>
                </span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-hover)] text-[color-mix(in_srgb,#a855f7_70%,var(--text-secondary))]">
                  <SparkleIcon />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium leading-tight text-[var(--text-primary)]">Launch AI agents</span>
                  <span className="mt-0.5 text-[11.5px] leading-tight text-[var(--text-muted)]">Claude Code or Codex, each in its own tab</span>
                </span>
              </span>
            </span>
            <span className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5 text-[11.5px] text-[var(--text-muted)]">
              <span className="flex items-center gap-2">
                <GripVerticalIcon size={13} />
                <span>Drag to arrange in the header, footer or a zone</span>
              </span>
              <span className="flex items-center gap-2">
                <MousePointerClickIcon size={13} />
                <span>Right-click an action for more options</span>
              </span>
            </span>
          </span>
        }
        side="bottom"
        wide
        disabled={open}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Create action"
          aria-haspopup="true"
          aria-expanded={open}
          className="magic-ring group h-8 shrink-0 rounded-lg p-[1px] transition-all duration-150 active:scale-[0.97]"
        >
          <span className="flex h-full items-center gap-1 rounded-[calc(0.5rem-1px)] bg-[var(--bg-primary)] px-2.5 text-xs font-medium transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,#a855f7_5%,var(--bg-primary))]">
            <span className="text-[color-mix(in_srgb,#a855f7_60%,var(--text-muted))]">
              <PlusIcon />
            </span>
            <span className="text-[var(--text-secondary)] transition-colors duration-150 group-hover:text-[var(--text-primary)]">Action</span>
          </span>
        </button>
      </Tooltip>
      {open &&
        style &&
        createPortal(
          <div ref={panelRef} style={style} className="z-[70]">
            <NewActionChooser
              onAction={() => choose(onAddAction)}
              onZone={(rows) => choose(() => onAddZone(rows))}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
