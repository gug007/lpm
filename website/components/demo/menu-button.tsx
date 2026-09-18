"use client";

import type { ReactNode } from "react";

/** A second, smaller button at the row's end with its own action, such as
 *  pinning the row elsewhere. Mirrors the app's ContextMenuItem. */
export type MenuTrailingAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

export function MenuButton({
  icon,
  label,
  onClick,
  danger,
  hint,
  disabled,
  title,
  trailingAction,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hint?: string;
  disabled?: boolean;
  title?: string;
  trailingAction?: MenuTrailingAction;
}) {
  const row = (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-[#f87171] hover:bg-[#2a2a2a]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span className="shrink-0 text-[#919191]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 font-mono text-[10px] text-[#919191]">{hint}</span>
      )}
    </button>
  );
  if (!trailingAction) return row;
  return (
    <div className="group flex items-stretch">
      {row}
      <button
        type="button"
        onClick={trailingAction.onClick}
        aria-label={trailingAction.label}
        title={trailingAction.label}
        className="mr-1.5 flex shrink-0 items-center rounded px-1 text-[#919191] opacity-50 transition-opacity hover:bg-[#2a2a2a] hover:text-[#e5e5e5] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      >
        {trailingAction.icon}
      </button>
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-[#2e2e2e]" />;
}
