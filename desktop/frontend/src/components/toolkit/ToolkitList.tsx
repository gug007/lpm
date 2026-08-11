import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { formatTokens } from "../../toolkit";
import type { ListNode, ListPanel } from "../../toolkitList";
import { toPanels } from "../../toolkitList";
import { panelMeta } from "../../toolkitRowText";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";
import { ToolkitRow } from "./ToolkitRow";
import { FAULT_LABEL, FAULT_PANEL, PANEL, PANEL_LABEL, ROW } from "./surfaces";

// Plugin blocks stay folded inside their kind's panel: one vendor shipping a
// dozen skills should not bury what the user installed themselves.
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
      className={`${ROW} text-[var(--text-secondary)] hover:bg-[var(--tk-hover)]`}
    >
      <span className="flex items-center gap-1.5 truncate font-mono text-[11.5px] leading-4">
        <span className="text-[var(--text-muted)] [&>svg]:h-2.5 [&>svg]:w-2.5">
          {node.open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        {node.label}
      </span>
      <span className="truncate text-[10.5px] leading-4 text-[var(--text-muted)]">
        {node.count} from this plugin
      </span>
      <span className="whitespace-nowrap text-[10.5px] leading-4 tabular-nums text-[var(--text-muted)]">
        {node.bytes > 0 ? `~${formatTokens(node.bytes)} est` : ""}
      </span>
    </button>
  );
}

function Heading({
  panel,
  flagged,
  onFilter,
  onToggle,
}: {
  panel: ListPanel;
  flagged: number;
  onFilter: (kind: CapabilityKind) => void;
  onToggle: (id: string) => void;
}) {
  const meta = panel.tone === "warn"
    ? `${panel.count} enabled but not loading`
    : panelMeta(panel.kind, panel.count, panel.bytes, flagged);

  const label = (
    <>
      <span className={`truncate ${panel.tone === "warn" ? FAULT_LABEL : ""}`}>
        {panel.label}
      </span>
      <span className="shrink-0 tabular-nums">{meta}</span>
    </>
  );

  if (panel.toggle) {
    return (
      <button
        type="button"
        onClick={() => onToggle(panel.toggle as string)}
        aria-expanded={panel.open}
        className={`${PANEL_LABEL} rounded-[var(--tk-radius-s)] hover:text-[var(--text-secondary)]`}
      >
        {label}
      </button>
    );
  }

  // The heading is the kind filter: clicking it narrows the pane to this kind,
  // which is what the row of chips above the list used to be for.
  if (panel.kind) {
    const kind = panel.kind;
    return (
      <button
        type="button"
        onClick={() => onFilter(kind)}
        title={`Show only ${panel.label.toLowerCase()}`}
        className={`${PANEL_LABEL} rounded-[var(--tk-radius-s)] hover:text-[var(--text-secondary)]`}
      >
        {label}
      </button>
    );
  }

  return <div className={PANEL_LABEL}>{label}</div>;
}

interface ToolkitListProps {
  nodes: ListNode[];
  summarise: (cap: AgentCapability) => string;
  flaggedByKind: Map<CapabilityKind, number>;
  showCli: boolean;
  activeIndex: number;
  onHover: (index: number) => void;
  onActivate: (cap: AgentCapability) => void;
  onToggleGroup: (id: string) => void;
  onFilterKind: (kind: CapabilityKind) => void;
}

// Renders straight from the prepared node list, so what is on screen and what
// the keyboard walks come from the same source.
export function ToolkitList({
  nodes,
  summarise,
  flaggedByKind,
  showCli,
  activeIndex,
  onHover,
  onActivate,
  onToggleGroup,
  onFilterKind,
}: ToolkitListProps) {
  const panels = toPanels(nodes);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
      {panels.map((panel) => (
        <section
          key={panel.id}
          aria-label={panel.label}
          className={panel.tone === "warn" ? FAULT_PANEL : PANEL}
        >
          <Heading
            panel={panel}
            flagged={panel.kind ? (flaggedByKind.get(panel.kind) ?? 0) : 0}
            onFilter={onFilterKind}
            onToggle={onToggleGroup}
          />
          {panel.nodes.map((node) =>
            node.type === "group" ? (
              <Group key={node.id} node={node} onToggle={() => onToggleGroup(node.id)} />
            ) : (
              <ToolkitRow
                key={node.cap.id}
                cap={node.cap}
                summary={summarise(node.cap)}
                fault={panel.tone === "warn"}
                nested={node.nested}
                showCli={showCli}
                active={node.index === activeIndex}
                onSelect={() => onHover(node.index)}
                onActivate={() => onActivate(node.cap)}
              />
            ),
          )}
        </section>
      ))}
    </div>
  );
}
