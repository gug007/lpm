import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { LaptopIcon } from "./LaptopIcon";

// A computer in the one list: its tile, its name, what it is doing, the one
// action worth a button, and details that open in place. Clicking anywhere on the
// row opens them; the buttons on it keep their own clicks.
export function MachineRowShell({
  name,
  badge,
  live,
  status,
  action,
  open,
  onToggle,
  children,
}: {
  name: string;
  badge?: string;
  live: boolean;
  status: ReactNode;
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{
            backgroundColor: live ? "color-mix(in srgb, var(--accent-green) 15%, transparent)" : "var(--bg-active)",
            color: live ? "var(--accent-green)" : "var(--text-muted)",
          }}
        >
          <LaptopIcon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="min-w-0 truncate text-left text-sm font-medium text-[var(--text-primary)] outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-[var(--text-muted)]"
            >
              {name}
            </button>
            {badge && (
              <span className="shrink-0 rounded-full bg-[var(--bg-active)] px-1.5 py-px text-[10px] font-medium text-[var(--text-secondary)]">
                {badge}
              </span>
            )}
          </div>
          <div className="pointer-events-none relative [&_button]:pointer-events-auto">{status}</div>
        </div>
        {action && <div className="relative flex shrink-0 items-center">{action}</div>}
        <ChevronDown
          size={14}
          aria-hidden
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)] bg-[var(--bg-secondary)] pl-16 pr-4">
          {children}
        </div>
      )}
    </div>
  );
}
