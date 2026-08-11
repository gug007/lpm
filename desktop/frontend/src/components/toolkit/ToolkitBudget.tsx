import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { KIND_LABELS, formatTokens, uncountedServers, upfrontBytes, upfrontTotal } from "../../toolkit";

const SEGMENT_COLORS: Partial<Record<CapabilityKind, string>> = {
  instructions: "var(--accent-cyan)",
  skill: "var(--accent-green)",
  subagent: "var(--accent-purple)",
};

// What the agent carries into every turn before the user types. Only the parts
// that can be measured honestly are in the number; the rest is named, not
// guessed at — a headline figure that is visibly wrong discredits the pane.
export function ToolkitBudget({ items }: { items: AgentCapability[] }) {
  const bytes = upfrontTotal(items);
  const servers = uncountedServers(items);
  if (bytes === 0 && servers === 0) return null;

  const groups = (Object.keys(SEGMENT_COLORS) as CapabilityKind[])
    .map((kind) => ({
      kind,
      bytes: items
        .filter((i) => i.kind === kind)
        .reduce((sum, i) => sum + upfrontBytes(i), 0),
    }))
    .filter((g) => g.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="flex flex-col gap-1.5 border-b border-[var(--border)] px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] tabular-nums text-[var(--text-primary)]">
          ~{formatTokens(bytes)} tokens
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          always in context, estimated
        </span>
        {servers > 0 && (
          <span
            className="ml-auto text-[10px] text-[var(--text-muted)]"
            title="Measuring a server's tool schemas means connecting to it, which lpm will not do as part of a refresh."
          >
            + {servers} MCP server{servers === 1 ? "" : "s"}, tool schemas not counted
          </span>
        )}
      </div>

      {bytes > 0 && (
        <>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
            {groups.map((group) => (
              <div
                key={group.kind}
                style={{
                  width: `${(group.bytes / bytes) * 100}%`,
                  background: SEGMENT_COLORS[group.kind],
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {groups.map((group) => (
              <span key={group.kind} className="flex items-center gap-1 text-[10px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: SEGMENT_COLORS[group.kind] }}
                />
                <span className="text-[var(--text-muted)]">
                  {KIND_LABELS[group.kind].toLowerCase()} {formatTokens(group.bytes)}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
