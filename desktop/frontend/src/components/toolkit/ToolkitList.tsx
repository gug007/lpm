import type { AgentCapability } from "../../toolkit";
import { formatTokens } from "../../toolkit";
import type { ListNode } from "../../toolkitList";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";
import { ToolkitRow } from "./ToolkitRow";

function Section({ node }: { node: Extract<ListNode, { type: "section" }> }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-[var(--bg-primary)] px-3 pb-1 pt-3">
      <span
        className={`text-[10px] font-medium uppercase tracking-wider ${
          node.tone === "warn" ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
        }`}
      >
        {node.label}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
        {node.count}
        {node.bytes > 0 ? ` · ~${formatTokens(node.bytes)}` : ""}
      </span>
    </div>
  );
}

function Group({
  node,
  onToggle,
}: {
  node: Extract<ListNode, { type: "group" }>;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={node.open}
      className="flex w-full items-baseline gap-1.5 py-[3px] pl-3 pr-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span className="w-3 shrink-0 self-center text-[var(--text-muted)] [&>svg]:h-2.5 [&>svg]:w-2.5">
        {node.open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </span>
      <span className="truncate font-mono text-[11.5px] text-[var(--text-secondary)]">
        {node.label}
      </span>
      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
        {node.count}
      </span>
      <span className="flex-1" />
      {node.bytes > 0 && (
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          ~{formatTokens(node.bytes)}
        </span>
      )}
    </button>
  );
}

interface ToolkitListProps {
  nodes: ListNode[];
  summarise: (cap: AgentCapability) => string;
  activeIndex: number;
  onHover: (index: number) => void;
  onActivate: (cap: AgentCapability) => void;
  onToggleGroup: (id: string) => void;
}

// Renders straight from the prepared node list, so what is on screen and what
// the keyboard walks come from the same source.
export function ToolkitList({
  nodes,
  summarise,
  activeIndex,
  onHover,
  onActivate,
  onToggleGroup,
}: ToolkitListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      {nodes.map((node) => {
        if (node.type === "section") return <Section key={node.id} node={node} />;
        if (node.type === "group")
          return <Group key={node.id} node={node} onToggle={() => onToggleGroup(node.id)} />;
        return (
          <ToolkitRow
            key={node.cap.id}
            cap={node.cap}
            summary={summarise(node.cap)}
            nested={node.nested}
            active={node.index === activeIndex}
            onSelect={() => onHover(node.index)}
            onActivate={() => onActivate(node.cap)}
          />
        );
      })}
    </div>
  );
}
