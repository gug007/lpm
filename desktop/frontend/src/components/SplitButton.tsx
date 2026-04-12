import { useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";

const dropdownPanelClass = "absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg";
const dropdownItemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]";

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
}

export function SplitButton({ action, disabled, onRunAction }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const children = action.children ?? [];
  const isSplit = !!action.cmd;

  const selectChild = (child: ActionInfo) => {
    setOpen(false);
    onRunAction(child);
  };

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
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
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
      <div className="inline-flex items-stretch rounded-lg border border-[var(--border)]">
        <button
          onClick={() => onRunAction(action)}
          disabled={disabled}
          className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          {action.label}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={`flex items-center rounded-r-lg border-l border-[var(--border)] px-1.5 transition-all hover:bg-[var(--bg-hover)] disabled:opacity-40 ${
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
