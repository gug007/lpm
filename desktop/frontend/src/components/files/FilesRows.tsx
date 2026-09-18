import { memo } from "react";
import { FilesRow, type RowTarget } from "./FilesRow";
import type { TreeCursorStore } from "./treeCursor";
import type { Item, TreeRow } from "./treeModel";

interface FilesRowsProps {
  rows: TreeRow[];
  // The mounted slice, with the space the rest would take.
  first: number;
  last: number;
  paddingTop: number;
  paddingBottom: number;
  decorations: ReadonlyMap<string, string>;
  dirtyPaths: ReadonlySet<string>;
  cursorStore: TreeCursorStore;
  onActivate: (item: Item) => void;
  onContextMenu: (target: RowTarget) => void;
  onDiscard: (item: Item) => void;
}

// The rows in reach of the viewport. Memoized on the tree's content and the
// slice: the selection and the cursor reach each row through the store, so
// neither re-renders the list.
export const FilesRows = memo(function FilesRows({
  rows,
  first,
  last,
  paddingTop,
  paddingBottom,
  decorations,
  dirtyPaths,
  cursorStore,
  onActivate,
  onContextMenu,
  onDiscard,
}: FilesRowsProps) {
  return (
    <div style={{ paddingTop, paddingBottom }}>
      {rows.slice(first, last + 1).map((row) => {
        const status = decorations.get(row.path);
        return (
          <FilesRow
            key={row.path}
            item={row}
            name={row.name}
            depth={row.depth}
            expanded={row.expanded}
            loading={row.loading}
            error={row.error}
            dirty={dirtyPaths.has(row.path)}
            status={status}
            cursorStore={cursorStore}
            onActivate={onActivate}
            onContextMenu={onContextMenu}
            onDiscard={status ? onDiscard : undefined}
          />
        );
      })}
    </div>
  );
});
