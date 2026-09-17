import { memo, useLayoutEffect, useRef } from "react";
import { BASE_LEFT_PX, INDENT_PX } from "../ChangedFilesTree";
import { FileTypeIcon } from "./FileTypeIcon";
import type { TreeRow } from "./treeModel";

export interface RowTarget {
  path: string;
  isDir: boolean;
  x: number;
  y: number;
}

interface FilesTreeRowProps {
  row: TreeRow;
  selected: boolean;
  // The keyboard cursor sits here; `focused` says whether the list has focus,
  // which is when the cursor is drawn.
  cursor: boolean;
  focused: boolean;
  dirty: boolean;
  onActivate: (item: { path: string; isDir: boolean }) => void;
  onContextMenu: (target: RowTarget) => void;
}

export const FilesTreeRow = memo(function FilesTreeRow({
  row,
  selected,
  cursor,
  focused,
  dirty,
  onActivate,
  onContextMenu,
}: FilesTreeRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selected || cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected, cursor]);
  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.isDir ? row.expanded : undefined}
      title={row.error ?? undefined}
      onClick={() => onActivate(row)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ path: row.path, isDir: row.isDir, x: e.clientX, y: e.clientY });
      }}
      style={{ paddingLeft: `${row.depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer select-none items-center gap-1.5 py-[5px] pr-2.5 transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      } ${cursor && focused ? "ring-1 ring-inset ring-[var(--accent-cyan)]/50" : ""}`}
    >
      {row.isDir ? (
        <span className="flex w-[26px] shrink-0 items-center justify-center">
          <span
            className={`text-[10px] text-[var(--text-muted)] transition-transform duration-150 ${
              row.expanded ? "rotate-90" : ""
            }`}
          >
            &#9654;
          </span>
        </span>
      ) : (
        <FileTypeIcon name={row.name} />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-xs ${
          selected
            ? "text-[var(--text-primary)]"
            : row.error
              ? "text-[var(--accent-red-text)]"
              : "text-[var(--text-secondary)]"
        }`}
      >
        {row.name}
      </span>
      {row.loading && (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]" aria-label="Loading">
          …
        </span>
      )}
      {dirty && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
          title="Unsaved changes"
        />
      )}
    </div>
  );
});
