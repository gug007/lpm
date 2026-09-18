import { memo } from "react";
import { useStore } from "zustand";
import { UndoIcon } from "../icons";
import { BASE_LEFT_PX, DirtyDot, INDENT_PX, TreeChevron } from "../treeRow";
import { FileTypeIcon } from "./FileTypeIcon";
import { IGNORED_TEXT, decorationOf } from "./gitDecorations";
import type { TreeCursorStore } from "./treeCursor";
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
  cursorStore: TreeCursorStore;
  dirty: boolean;
  // The git status of the file, or of the changes inside the folder.
  status?: string;
  // Matched by a .gitignore rule: the name greys, the icon keeps its colour.
  ignored?: boolean;
  onActivate: (item: Item) => void;
  onContextMenu: (target: RowTarget) => void;
  // Given only for rows that hold uncommitted changes.
  onDiscard?: (item: Item) => void;
}

export const FilesRow = memo(function FilesRow({
  item,
  name,
  depth,
  expanded = false,
  loading = false,
  error = null,
  cursorStore,
  dirty,
  status,
  ignored = false,
  onActivate,
  onContextMenu,
  onDiscard,
}: FilesRowProps) {
  const selected = useStore(cursorStore, (s) => s.selectedPath === item.path);
  // The keyboard cursor sits here and the list has focus.
  const cursor = useStore(cursorStore, (s) => s.listFocused && s.cursorPath === item.path);
  const decoration = status ? decorationOf(status) : null;
  const nameClass = error
    ? "text-[var(--accent-red-text)]"
    : decoration
      ? `${decoration.text}${decoration.strike ? " line-through" : ""}`
      : ignored
        ? IGNORED_TEXT
        : selected
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]";
  return (
    <div
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
      className={`group flex cursor-pointer select-none items-center gap-1.5 py-[5px] pr-2.5 transition-colors ${
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
      <span className={`min-w-0 flex-1 truncate text-xs ${nameClass}`}>{name}</span>
      {loading && (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]" aria-label="Loading">
          …
        </span>
      )}
      {onDiscard && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDiscard(item);
          }}
          title={item.isDir ? "Discard all changes in this folder" : "Discard changes to this file"}
          aria-label="Discard changes"
          className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-red-text)] focus-visible:opacity-100 group-hover:opacity-100 [&>svg]:h-3 [&>svg]:w-3"
        >
          <UndoIcon />
        </button>
      )}
      {status && (item.isDir ? <ChangeDot status={status} /> : <StatusMark status={status} />)}
      {dirty && <DirtyDot />}
    </div>
  );
});

function StatusMark({ status }: { status: string }) {
  const { letter, text } = decorationOf(status);
  return (
    <span
      className={`w-3 shrink-0 text-center text-[11px] font-semibold ${text}`}
      title={status}
      aria-label={status}
    >
      {letter}
    </span>
  );
}

function ChangeDot({ status }: { status: string }) {
  const { dot } = decorationOf(status);
  return (
    <span className="flex w-3 shrink-0 justify-center">
      <span
        className={`h-1.5 w-1.5 rounded-full ${dot}`}
        title="Contains changes"
        aria-label="Contains changes"
      />
    </span>
  );
}
