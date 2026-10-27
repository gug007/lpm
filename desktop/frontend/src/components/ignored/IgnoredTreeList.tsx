import { IgnoredEnvCompare } from "./IgnoredEnvCompare";
import { IgnoredTreeRow, rowContentLeft } from "./IgnoredTreeRow";
import { tickOf } from "./ignoredSelection";
import type { Prefer, SyncPair } from "./ignoredSyncApi";
import { canCompareEnv, keptSide, shownSide, statusOf, type Row, type TreeNode, type View } from "./ignoredTree";

interface IgnoredTreeListProps {
  // The computers ticked to sync with.
  pairs: SyncPair[];
  rows: Row[];
  sel: ReadonlySet<string>;
  view: View;
  prefer: Prefer;
  loadingDirs: ReadonlySet<string>;
  comparing: string | null;
  query: string;
  onToggleOpen: (node: TreeNode) => void;
  onToggleTick: (node: TreeNode) => void;
  onCompare: (path: string | null) => void;
}

export function IgnoredTreeList({
  pairs,
  rows,
  sel,
  view,
  prefer,
  loadingDirs,
  comparing,
  query,
  onToggleOpen,
  onToggleTick,
  onCompare,
}: IgnoredTreeListProps) {
  if (!rows.length) {
    return (
      <div className="px-6 py-10 text-center text-[12.5px] text-[var(--text-muted)]">
        {query ? `No ignored file or folder matches “${query}”.` : "Git ignores nothing in this project on any of these computers."}
      </div>
    );
  }
  return (
    <>
      {rows.map(({ node, depth, open, more }) => {
        if (more) {
          return (
            <div
              key={`${node.path}…`}
              className="py-1.5 pr-5 text-[11.5px] text-[var(--text-muted)]"
              style={{ paddingLeft: rowContentLeft(depth) }}
            >
              {node.more.toLocaleString()} more not listed. Tick {node.name}/ to take them all.
            </div>
          );
        }
        const canCompare = canCompareEnv(node);
        return (
          <div key={node.path}>
            <IgnoredTreeRow
              node={node}
              depth={depth}
              open={open}
              loading={loadingDirs.has(node.path)}
              tick={tickOf(node, sel)}
              status={statusOf(node, view)}
              shown={shownSide(node)}
              canCompare={canCompare}
              comparing={comparing === node.path}
              onToggleOpen={() => onToggleOpen(node)}
              onToggleTick={() => onToggleTick(node)}
              onCompare={() => onCompare(comparing === node.path ? null : node.path)}
            />
            {canCompare && comparing === node.path && (
              <IgnoredEnvCompare
                pairs={pairs}
                path={node.path}
                kept={keptSide(node, prefer)}
                here={view.here}
                indent={rowContentLeft(depth)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
