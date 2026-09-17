import { memo, useLayoutEffect, useRef } from "react";
import { BASE_LEFT_PX, DirtyDot, INDENT_PX, TreeChevron } from "../treeRow";
import { FileTypeIcon } from "./FileTypeIcon";
import type { Item } from "./treeModel";

export interface RowTarget extends Item {
  x: number;
  y: number;
}

interface FilesRowProps {
  item: Item;
  name: string;
  depth: number;
  expanded?: boolean;
  loading?: boolean;
  error?: string | null;
  selected: boolean;
  // The keyboard cursor sits here and the list has focus.
  cursor: boolean;
  dirty: boolean;
  onActivate: (item: Item) => void;
  onContextMenu: (target: RowTarget) => void;
}

export const FilesRow = memo(function FilesRow({
  item,
  name,
  depth,
  expanded = false,
  loading = false,
  error = null,
  selected,
  cursor,
  dirty,
  onActivate,
  onContextMenu,
}: FilesRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selected || cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected, cursor]);
  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={item.isDir ? expanded : undefined}
      title={error ?? undefined}
      onClick={() => onActivate(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ path: item.path, isDir: item.isDir, x: e.clientX, y: e.clientY });
      }}
      style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer select-none items-center gap-1.5 py-[5px] pr-2.5 transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      } ${cursor ? "ring-1 ring-inset ring-[var(--accent-cyan)]/50" : ""}`}
    >
      {!item.isDir ? (
        <FileTypeIcon name={name} />
      ) : (
        <span className="flex w-[26px] shrink-0 items-center justify-center">
          <TreeChevron open={expanded} />
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-xs ${
          selected
            ? "text-[var(--text-primary)]"
            : error
              ? "text-[var(--accent-red-text)]"
              : "text-[var(--text-secondary)]"
        }`}
      >
        {name}
      </span>
      {loading && (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]" aria-label="Loading">
          …
        </span>
      )}
      {dirty && <DirtyDot />}
    </div>
  );
});
