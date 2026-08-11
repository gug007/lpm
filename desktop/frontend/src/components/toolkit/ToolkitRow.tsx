import { useEffect, useMemo, useRef } from "react";
import type { AgentCapability } from "../../toolkit";
import {
  capabilityIssue,
  formatTokens,
  scopeLabel,
  shortDescription,
  shortPath,
  upfrontBytes,
} from "../../toolkit";

// State reads from the glyph before the text, so a list of forty rows can be
// scanned rather than read.
function StateGlyph({ cap }: { cap: AgentCapability }) {
  if (cap.shadowedBy)
    return <span className="text-[var(--accent-amber)]" title="Shadowed">⤬</span>;
  if (cap.problem)
    return <span className="text-[var(--accent-red)]" title="Problem">✘</span>;
  if (!cap.enabled)
    return <span className="text-[var(--text-muted)]" title="Disabled">⊘</span>;
  return <span className="text-[var(--accent-green)]" title="Active">✔</span>;
}

interface ToolkitRowProps {
  cap: AgentCapability;
  active: boolean;
  nested: boolean;
  onSelect: () => void;
  onActivate: () => void;
}

export function ToolkitRow({ cap, active, nested, onSelect, onActivate }: ToolkitRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const issue = capabilityIssue(cap);
  const muted = Boolean(cap.shadowedBy) || !cap.enabled;
  const upfront = upfrontBytes(cap);
  const summary = useMemo(() => shortDescription(cap.description), [cap.description]);

  // Keyboard navigation drives `active`, so the row has to bring itself into
  // view — the caller does not know the scroll container's geometry.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      onMouseMove={onSelect}
      onClick={onActivate}
      aria-current={active}
      title={cap.description || shortPath(cap.path)}
      className={`flex w-full items-baseline gap-2 py-[3px] pr-3 text-left transition-colors ${
        nested ? "pl-7" : "pl-3"
      } ${active ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"}`}
    >
      <span className="w-3 shrink-0 text-[11px] leading-5">
        <StateGlyph cap={cap} />
      </span>

      <span
        className={`max-w-[42%] shrink-0 truncate font-mono text-[12px] ${
          muted ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
        }`}
      >
        {cap.name}
      </span>

      {/* Scope only when it is not the obvious one: "user" on forty rows is
          decoration, while project/local/plugin genuinely change behaviour. */}
      {cap.scope !== "user" && (
        <span className="shrink-0 text-[9.5px] uppercase leading-[14px] tracking-wide text-[var(--text-muted)]">
          {scopeLabel(cap.scope)}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-[11px]">
        {issue && <span className="text-[var(--accent-amber)]">{issue}</span>}
        {issue && summary && <span className="text-[var(--text-muted)]"> · </span>}
        {summary && (
          <span className="text-[var(--text-muted)]">{summary}</span>
        )}
      </span>

      {/* Skills and subagents all cost roughly one description, so printing
          that per row is a column of near-identical numbers. Only the figures
          that actually differ earn the space. */}
      {cap.kind === "instructions" && upfront > 0 && (
        <span
          className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]"
          title="Estimated tokens loaded before your turn"
        >
          {formatTokens(upfront)}
        </span>
      )}
    </button>
  );
}
