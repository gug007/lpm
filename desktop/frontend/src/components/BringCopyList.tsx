import { Check } from "lucide-react";
import { bringTargetBlockedReason } from "./bringChangesSources";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import type { BringTarget } from "../bringChangesApi";
import { useAppStore } from "../store/app";

interface BringCopyListProps {
  copies: BringTarget[];
  value: string;
  onChange: (name: string) => void;
}

export function BringCopyList({ copies, value, onChange }: BringCopyListProps) {
  const projects = useAppStore((s) => s.projects);

  return (
    <div className="max-h-44 space-y-1 overflow-y-auto">
      {copies.map((copy) => {
        const reason = bringTargetBlockedReason(copy);
        const active = copy.name === value;
        return (
          <button
            key={copy.name}
            type="button"
            disabled={Boolean(reason)}
            onClick={() => onChange(copy.name)}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/8"
                : "border-[var(--border)] bg-[var(--bg-secondary)]/40 hover:bg-[var(--bg-hover)] disabled:hover:bg-[var(--bg-secondary)]/40"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-[var(--text-primary)]">
                {displayNameForProjectName(copy.name, projects)}
              </span>
              {reason && (
                <span className="block truncate text-[11px] text-[var(--accent-amber)]">
                  {reason}
                </span>
              )}
            </span>
            {active && (
              <Check size={14} className="shrink-0 text-[var(--accent-cyan)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
