import { useEffect, useRef } from "react";
import type { AgentCapability } from "../../toolkit";
import { capabilityIssue, formatTokens, scopeLabel, shortPath, upfrontBytes } from "../../toolkit";

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
  onSelect: () => void;
  onActivate: () => void;
}

export function ToolkitRow({ cap, active, onSelect, onActivate }: ToolkitRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const issue = capabilityIssue(cap);
  const muted = Boolean(cap.shadowedBy) || !cap.enabled;
  const upfront = upfrontBytes(cap);

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
      className={`flex w-full items-baseline gap-2 px-3 py-[3px] text-left transition-colors ${
        active ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className="w-3 shrink-0 text-[11px] leading-5">
        <StateGlyph cap={cap} />
      </span>

      <span
        className={`max-w-[46%] shrink-0 truncate font-mono text-[12px] ${
          muted ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
        }`}
      >
        {cap.name}
      </span>

      <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1 py-px text-[9.5px] uppercase leading-[14px] tracking-wide text-[var(--text-muted)]">
        {scopeLabel(cap.scope)}
      </span>

      {/* Both the issue and what the thing does: replacing one with the other
          leaves the user unable to judge whether the breakage matters. */}
      <span className="min-w-0 flex-1 truncate text-[11px]">
        {issue && <span className="text-[var(--accent-amber)]">{issue}</span>}
        {issue && cap.description && (
          <span className="text-[var(--text-muted)]"> · </span>
        )}
        {cap.description && (
          <span className={issue ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>
            {cap.description}
          </span>
        )}
      </span>

      {/* Only the cost this capability actually adds before the user types —
          a file size here would read as a token figure and overstate it. */}
      {upfront > 0 && (
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
