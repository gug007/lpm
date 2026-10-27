import { File, Folder, KeyRound, Loader2 } from "lucide-react";
import { formatBytes } from "../../syncApi";
import { TriStateCheckbox, type CheckState } from "../ChangedFilesTree";
import { BASE_LEFT_PX, INDENT_PX, TreeChevron } from "../treeRow";
import { isSecretName, type Shown, type Status, type Tone, type TreeNode } from "./ignoredTree";
import { countOf } from "./syncWords";

const TONE: Record<Tone, string> = {
  green: "bg-[var(--accent-green)]/12 text-[var(--accent-green-text)]",
  amber: "bg-[var(--accent-amber)]/12 text-[var(--accent-amber-text)]",
  red: "bg-[var(--accent-red)]/12 text-[var(--accent-red-text)]",
  muted: "bg-[var(--bg-secondary)] text-[var(--text-muted)]",
};

/// Where a row's content starts, past its chevron and tick box: what the lines
/// hung under a row line up with.
export function rowContentLeft(depth: number): number {
  return BASE_LEFT_PX + depth * INDENT_PX + 52;
}

interface IgnoredTreeRowProps {
  node: TreeNode;
  depth: number;
  open: boolean;
  loading: boolean;
  tick: CheckState;
  status: Status;
  shown: Shown | undefined;
  canCompare: boolean;
  comparing: boolean;
  onToggleOpen: () => void;
  onToggleTick: () => void;
  onCompare: () => void;
}

function rowIcon(node: TreeNode) {
  if (node.dir) return <Folder size={14} className={node.ignored ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"} />;
  if (isSecretName(node.name)) return <KeyRound size={13} className="text-[var(--accent-amber-text)]" />;
  return <File size={13} className="text-[var(--text-muted)]" />;
}

function detail(node: TreeNode, shown: Shown | undefined): string {
  if (!node.dir || !shown) return "";
  return node.ignored ? countOf(shown.files, "file") : `${countOf(shown.files, "ignored file")} inside`;
}

export function IgnoredTreeRow({
  node,
  depth,
  open,
  loading,
  tick,
  status,
  shown,
  canCompare,
  comparing,
  onToggleOpen,
  onToggleTick,
  onCompare,
}: IgnoredTreeRowProps) {
  return (
    <div
      className="flex min-h-[32px] items-center gap-1.5 pr-5"
      style={{ paddingLeft: BASE_LEFT_PX + depth * INDENT_PX }}
    >
      {node.dir ? (
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={`${open ? "Close" : "Open"} ${node.path}`}
          aria-expanded={open}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        >
          {loading ? <Loader2 size={12} className="animate-spin text-[var(--text-muted)]" /> : <TreeChevron open={open} />}
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <TriStateCheckbox state={tick} onToggle={onToggleTick} ariaLabel={`Sync ${node.path}`} />
      <button
        type="button"
        onClick={node.dir ? onToggleOpen : onToggleTick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[var(--bg-hover)]"
      >
        <span className="flex w-4 shrink-0 justify-center">{rowIcon(node)}</span>
        <span className="truncate font-mono text-[12.5px] text-[var(--text-primary)]">
          {node.dir ? `${node.name}/` : node.name}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[11.5px] text-[var(--text-muted)]">{detail(node, shown)}</span>
      </button>
      <span className={`ml-1.5 shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] leading-none ${TONE[status.tone]}`}>
        {status.label}
      </span>
      {canCompare && (
        <button
          type="button"
          onClick={onCompare}
          aria-expanded={comparing}
          className="ml-2 shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          {comparing ? "Hide" : "Compare"}
        </button>
      )}
      <span className="w-[72px] shrink-0 text-right text-[11.5px] text-[var(--text-muted)]">
        {shown ? formatBytes(shown.size) : ""}
      </span>
    </div>
  );
}
