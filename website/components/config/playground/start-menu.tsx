import type { ReactNode } from "react";
import { Check } from "lucide-react";

export function StartMenuSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-3 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}

export type StartMenuItemProps = {
  label: string;
  subtext?: string;
  badge?: string;
  mono?: boolean;
  running?: boolean;
  showDot?: boolean;
  showCheck?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
};

export function StartMenuItem({
  label,
  subtext,
  badge,
  mono = false,
  running = false,
  showDot = true,
  showCheck = false,
  icon,
  shortcut,
  onClick,
}: StartMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
    >
      {icon ? (
        <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">
          {icon}
        </span>
      ) : showDot ? (
        <StatusDot running={running} />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate ${mono ? "font-mono" : ""}`}>{label}</span>
        {subtext && (
          <span className="truncate text-[10px] text-gray-400 dark:text-gray-500 font-mono">
            {subtext}
          </span>
        )}
      </span>
      {showCheck && (
        <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
      )}
      {shortcut && <TrailingMeta>{shortcut}</TrailingMeta>}
      {badge && <TrailingMeta>{badge}</TrailingMeta>}
    </button>
  );
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        running
          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
          : "border border-gray-300 dark:border-gray-700"
      }`}
    />
  );
}

function TrailingMeta({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
      {children}
    </span>
  );
}
