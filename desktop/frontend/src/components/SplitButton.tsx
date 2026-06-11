import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";
import { withEmoji } from "../withEmoji";
import { useActionsDragActive } from "./ActionsDnd";
import { SplitButtonMenuItem } from "./SplitButtonMenuItem";

const SIZE_CLASSES = {
  default: {
    rounded: "rounded-lg",
    roundedL: "rounded-l-lg",
    roundedR: "rounded-r-lg",
    padding: "px-3.5 py-1.5 text-xs",
    chevronPad: "px-1.5",
    side: "below",
    border: "border border-[var(--border)]",
    dividerBorder: "border-l border-[var(--border)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
    active: "bg-[var(--bg-active)] text-[var(--text-primary)]",
  },
  compact: {
    rounded: "rounded-md",
    roundedL: "rounded-l-md",
    roundedR: "rounded-r-md",
    padding: "px-2.5 py-1 text-[11px]",
    chevronPad: "px-1.5",
    side: "above",
    border: "border border-[var(--border)] bg-[var(--bg-secondary)]",
    dividerBorder: "border-l border-[var(--border)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
    active: "bg-[var(--bg-hover)] text-[var(--text-primary)]",
  },
} as const;

const PANEL_WIDTH = 256;

const dropdownPanelClass = "z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl";

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent) => void;
  compact?: boolean;
}

export function SplitButton({ action, disabled, onRunAction, onContextMenu, compact = false }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const dragActive = useActionsDragActive();
  // Keep this menu open through a drag only if it was already open when the
  // drag started (so its items stay draggable), rather than popping every
  // menu open on any drag.
  const keepOpenRef = useRef(false);
  const prevDragActiveRef = useRef(false);
  useEffect(() => {
    if (dragActive && !prevDragActiveRef.current) keepOpenRef.current = open;
    prevDragActiveRef.current = dragActive;
  }, [dragActive, open]);
  const panelOpen = open || (dragActive && keepOpenRef.current);
  const s = compact ? SIZE_CLASSES.compact : SIZE_CLASSES.default;
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open: panelOpen,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: s.side,
  });

  const children = action.children ?? [];
  const isSplit = !!action.cmd;

  const handleSelectChild = (child: ActionInfo) => {
    setOpen(false);
    onRunAction(child);
  };

  const dropdown = panelOpen && style && createPortal(
    <div ref={panelRef} style={style} className={dropdownPanelClass}>
      <SortableContext items={children.map((c) => c.name)} strategy={verticalListSortingStrategy}>
        {children.map((child) => (
          <SplitButtonMenuItem key={child.name} child={child} onSelect={handleSelectChild} />
        ))}
      </SortableContext>
    </div>,
    document.body,
  );

  const trigger = isSplit ? (
    <div className={`inline-flex items-stretch ${s.rounded} ${s.border}`}>
      <button
        onClick={() => onRunAction(action)}
        disabled={disabled}
        className={`whitespace-nowrap ${s.roundedL} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {withEmoji(action.emoji, action.label)}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`flex items-center ${s.roundedR} ${s.dividerBorder} ${s.chevronPad} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40 ${open ? s.active : s.text}`}
      >
        <ChevronDownIcon />
      </button>
    </div>
  ) : (
    <button
      onClick={() => setOpen((v) => !v)}
      disabled={disabled}
      className={`inline-flex items-center gap-1 whitespace-nowrap ${s.rounded} ${s.border} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {withEmoji(action.emoji, action.label)}
      <ChevronDownIcon />
    </button>
  );

  return (
    <div ref={triggerRef} onContextMenu={onContextMenu} className="shrink-0 cursor-grab select-none">
      {trigger}
      {dropdown}
    </div>
  );
}
