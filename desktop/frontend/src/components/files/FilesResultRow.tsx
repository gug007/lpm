import { memo, useLayoutEffect, useRef } from "react";
import { FolderIcon } from "../icons";
import { FileTypeIcon } from "./FileTypeIcon";
import type { IndexEntry } from "./filesFilter";
import { baseName, parentPath } from "./treeModel";
import type { RowTarget } from "./FilesTreeRow";

interface FilesResultRowProps {
  entry: IndexEntry;
  selected: boolean;
  cursor: boolean;
  focused: boolean;
  dirty: boolean;
  onActivate: (item: { path: string; isDir: boolean }) => void;
  onContextMenu: (target: RowTarget) => void;
}

// One "Filter files" hit: the name, then where it lives.
export const FilesResultRow = memo(function FilesResultRow({
  entry,
  selected,
  cursor,
  focused,
  dirty,
  onActivate,
  onContextMenu,
}: FilesResultRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const name = baseName(entry.path);
  const dir = parentPath(entry.path);
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      onClick={() => onActivate(entry)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ path: entry.path, isDir: entry.isDir, x: e.clientX, y: e.clientY });
      }}
      className={`flex cursor-pointer select-none items-center gap-1.5 py-[5px] pl-2.5 pr-2.5 transition-colors ${
        selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      } ${cursor && focused ? "ring-1 ring-inset ring-[var(--accent-cyan)]/50" : ""}`}
    >
      {entry.isDir ? (
        <span className="flex w-[26px] shrink-0 items-center justify-center text-[var(--text-muted)] [&>svg]:h-3 [&>svg]:w-3">
          <FolderIcon />
        </span>
      ) : (
        <FileTypeIcon name={name} />
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-xs">
        <span
          className={`min-w-0 truncate ${
            selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          }`}
        >
          {name}
        </span>
        {dir && (
          <span className="min-w-0 shrink-[3] truncate text-[11px] text-[var(--text-muted)]">
            {dir}
          </span>
        )}
      </span>
      {dirty && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
          title="Unsaved changes"
        />
      )}
    </div>
  );
});
