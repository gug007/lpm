import { memo } from "react";
import { branchTextColor, type GraphRow } from "../../gitGraph";
import { commitAgent, coAuthorName, type HistoryCommit } from "../../gitHistory";
import { relativeAgo } from "../../relativeTime";
import { AgentGlyph } from "../terminal/AgentGlyph";
import { HistoryGraphCell } from "./HistoryGraphCell";
import { DIM_OPACITY, ROW_H, isDimmed } from "./graphGeometry";

interface HistoryCommitRowProps {
  commit: HistoryCommit;
  graph: GraphRow;
  lanes: number;
  // The branch whose line is hovered; every other commit fades.
  hover: number | null;
  selected: boolean;
  onSelect: (hash: string) => void;
  onHover: (branch: number | null) => void;
}

const MAX_REFS = 2;

function rowLabels(commit: HistoryCommit, graph: GraphRow): string[] {
  const labels = commit.refs.slice(0, MAX_REFS);
  if (graph.label && !labels.includes(graph.label)) labels.push(graph.label);
  return labels;
}

export const HistoryCommitRow = memo(function HistoryCommitRow({
  commit,
  graph,
  lanes,
  hover,
  selected,
  onSelect,
  onHover,
}: HistoryCommitRowProps) {
  const agent = commitAgent(commit);
  const labels = rowLabels(commit, graph);
  const textColor = branchTextColor(graph.branch);
  const dimmed = isDimmed(graph.branch, hover);
  return (
    <button
      type="button"
      onClick={() => onSelect(commit.hash)}
      aria-current={selected || undefined}
      style={{ height: ROW_H }}
      className={`group relative flex w-full items-center gap-2.5 rounded-md pl-2 pr-2.5 text-left transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        aria-hidden
        className="flex shrink-0 self-stretch"
        onMouseEnter={() => onHover(graph.branch)}
        onMouseLeave={() => onHover(null)}
      >
        <HistoryGraphCell row={graph} lanes={lanes} hover={hover} unpushed={commit.unpushed} />
      </span>
      <span
        className="flex min-w-0 flex-1 items-center gap-2.5 transition-opacity"
        style={{ opacity: dimmed ? DIM_OPACITY + 0.15 : 1 }}
      >
        {labels.map((name) => (
          <span
            key={name}
            className="max-w-[10rem] shrink-0 truncate rounded px-1.5 font-mono text-[10.5px] leading-[17px]"
            style={{ color: textColor, backgroundColor: `color-mix(in srgb, ${textColor} 13%, transparent)` }}
            title={name}
          >
            {name}
          </span>
        ))}
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}
          title={commit.subject}
        >
          {commit.subject}
        </span>
        {agent && (
          <span title={`With ${coAuthorName(commit.coAuthors[0])}`} className="flex shrink-0">
            <AgentGlyph agent={agent} size={12} />
          </span>
        )}
        {commit.unpushed && (
          <span title="Not pushed yet" className="shrink-0 text-[11px] text-[var(--accent-cyan)]">
            ↑
          </span>
        )}
        <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
          {relativeAgo(commit.time)}
        </span>
      </span>
    </button>
  );
});
