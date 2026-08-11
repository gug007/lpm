import { useState } from "react";
import type { AgentCapabilities } from "../../toolkit";
import { CLI_LABELS, shortPath } from "../../toolkit";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";

// Where the answer came from, collapsed by default. Present roots are listed
// first; the absent ones collapse to a count, because "we looked and found
// nothing" is worth one line, not fifteen.
export function ToolkitRoots({ data }: { data: AgentCapabilities }) {
  const [open, setOpen] = useState(false);
  const present = data.roots.filter((r) => r.exists);
  const missing = data.roots.length - present.length;

  return (
    <div className="shrink-0 px-3 py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-left text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <span className="[&>svg]:h-2.5 [&>svg]:w-2.5">
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className="uppercase tracking-wider">Scanned</span>
        <span className="tabular-nums">
          {present.length} location{present.length === 1 ? "" : "s"}
          {missing > 0 && `, ${missing} absent`}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-px pb-1 pl-4 pt-1">
          {[...present, ...data.roots.filter((r) => !r.exists)].map((root) => (
            <div
              key={`${root.cli}:${root.scope}:${root.path}`}
              className="flex items-baseline gap-2 text-[10px]"
              title={root.path}
            >
              <span className={root.exists ? "text-[var(--accent-green-text)]" : "text-[var(--text-muted)]"}>
                {root.exists ? "✔" : "—"}
              </span>
              <span
                className={`min-w-0 flex-1 truncate font-mono ${
                  root.exists ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
                }`}
              >
                {shortPath(root.path)}
              </span>
              <span className="shrink-0 text-[var(--text-muted)]">
                {CLI_LABELS[root.cli] ?? root.cli} · {root.scope}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
