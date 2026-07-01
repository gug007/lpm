import { useState } from "react";
import { ChevronRightIcon } from "./icons";
import { PromptImprover } from "./PromptImprover";

interface PromptFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  defaultCollapsed?: boolean;
  rows?: number;
}

export function PromptField({ label, value, onChange, hint, defaultCollapsed = false, rows = 5 }: PromptFieldProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 text-xs text-[var(--text-secondary)] opacity-70 transition-opacity hover:opacity-100"
      >
        <span className={`flex transition-transform ${collapsed ? "" : "rotate-90"}`}><ChevronRightIcon /></span>
        <span className="shrink-0">{label}</span>
        {collapsed && value.trim() && (
          <span className="ml-1 min-w-0 flex-1 truncate text-left font-normal text-[var(--text-muted)]">— {value.trim()}</span>
        )}
      </button>
      {!collapsed && (
        <div className="mt-1">
          {hint && <p className="mb-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm leading-relaxed"
          />
          <div className="mt-1.5 flex justify-end">
            <PromptImprover value={value} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  );
}
