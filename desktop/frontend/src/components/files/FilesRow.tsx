import { memo, useLayoutEffect, useRef } from "react";
import { FolderIcon } from "../icons";
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
  // A tree row has a depth (indent + chevron for folders); a filter hit has
  // none, shows a folder glyph instead, and names its folder as a subtitle.
  depth?: number;
  expanded?: boolean;
  subtitle?: string;
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
  subtitle,
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
  const inTree = depth !== undefined;
  return (
    <div
      ref={ref}
      role={inTree ? "treeitem" : "option"}
      aria-level={inTree ? depth + 1 : undefined}
      aria-selected={selected}
      aria-expanded={inTree && item.isDir ? expanded : undefined}
      title={error ?? undefined}
      onClick={() => onActivate(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ path: item.path, isDir: item.isDir, x: e.clientX, y: e.clientY });
      }}
      style={{ paddingLeft: `${(depth ?? 0) * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer select-none items-center gap-1.5 py-[5px] pr-2.5 transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      } ${cursor ? "ring-1 ring-inset ring-[var(--accent-cyan)]/50" : ""}`}
    >
      {!item.isDir ? (
        <FileTypeIcon name={name} />
      ) : (
        <span className="flex w-[26px] shrink-0 items-center justify-center text-[var(--text-muted)] [&>svg]:h-3 [&>svg]:w-3">
          {inTree ? <TreeChevron open={expanded} /> : <FolderIcon />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-xs">
        <span
          className={`min-w-0 truncate ${
            selected
              ? "text-[var(--text-primary)]"
              : error
                ? "text-[var(--accent-red-text)]"
                : "text-[var(--text-secondary)]"
          }`}
        >
          {name}
        </span>
        {subtitle && (
          <span className="min-w-0 shrink-[3] truncate text-[11px] text-[var(--text-muted)]">
            {subtitle}
          </span>
        )}
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
