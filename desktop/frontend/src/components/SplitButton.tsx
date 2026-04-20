import { useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";

const SIZE_CLASSES = {
  default: {
    rounded: "rounded-lg",
    roundedL: "rounded-l-lg",
    roundedR: "rounded-r-lg",
    padding: "px-3.5 py-1.5 text-xs",
    chevronPad: "px-1.5",
    dropdownPos: "top-full mt-1",
  },
  compact: {
    rounded: "rounded-md",
    roundedL: "rounded-l-md",
    roundedR: "rounded-r-md",
    padding: "px-2.5 py-1 text-[11px]",
    chevronPad: "px-1",
    dropdownPos: "bottom-full mb-1",
  },
} as const;

const dropdownItemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]";

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
  compact?: boolean;
}

export function SplitButton({ action, disabled, onRunAction, compact = false }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const children = action.children ?? [];
  const isSplit = !!action.cmd;
  const s = compact ? SIZE_CLASSES.compact : SIZE_CLASSES.default;

  const selectChild = (child: ActionInfo) => {
    setOpen(false);
    onRunAction(child);
  };

  const dropdownPanelClass = `absolute right-0 ${s.dropdownPos} z-50 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg`;

  const dropdown = open && (
    <div className={dropdownPanelClass}>
      {children.map((child) => (
        <button key={child.name} onClick={() => selectChild(child)} className={dropdownItemClass}>
          <span className="flex-1 truncate">{child.label}</span>
        </button>
      ))}
    </div>
  );

  if (!isSplit) {
    return (
      <div ref={ref} className="relative shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={`inline-flex items-center gap-1 whitespace-nowrap ${s.rounded} border border-[var(--border)] ${s.padding} font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40`}
        >
          {action.label}
          <ChevronDownIcon />
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <div className={`inline-flex items-stretch ${s.rounded} border border-[var(--border)]`}>
        <button
          onClick={() => onRunAction(action)}
          disabled={disabled}
          className={`whitespace-nowrap ${s.roundedL} ${s.padding} font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40`}
        >
          {action.label}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={`flex items-center ${s.roundedR} border-l border-[var(--border)] ${s.chevronPad} transition-all hover:bg-[var(--bg-hover)] disabled:opacity-40 ${
            open ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          }`}
        >
          <ChevronDownIcon />
        </button>
      </div>
      {dropdown}
    </div>
  );
}
