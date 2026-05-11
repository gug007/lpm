import { useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";

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
const dropdownItemClass = "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent) => void;
  compact?: boolean;
}

export function SplitButton({ action, disabled, onRunAction, onContextMenu, compact = false }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const s = compact ? SIZE_CLASSES.compact : SIZE_CLASSES.default;
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
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

  const dropdown = open && style && createPortal(
    <div ref={panelRef} style={style} className={dropdownPanelClass}>
      {children.map((child) => (
        <button key={child.name} onClick={() => handleSelectChild(child)} className={dropdownItemClass}>
          <span className="flex-1 truncate">{child.label}</span>
        </button>
      ))}
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
        {action.label}
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
      {action.label}
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
