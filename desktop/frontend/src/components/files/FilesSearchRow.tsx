import { memo } from "react";
import { Replace, ReplaceAll } from "lucide-react";
import { BASE_LEFT_PX, INDENT_PX, TreeChevron } from "../treeRow";
import { FileTypeIcon } from "./FileTypeIcon";
import type { SearchRow } from "./fileSearch";
import { parentPath } from "./treeModel";

export const SEARCH_ROW_PX = 24;

const MARK = "rounded-[3px] bg-[color-mix(in_srgb,var(--accent-amber)_30%,transparent)] text-[var(--text-primary)]";
const REMOVED =
  "rounded-[3px] bg-[color-mix(in_srgb,var(--accent-red)_18%,transparent)] text-[var(--accent-red-text)] line-through";
const ADDED = "rounded-[3px] bg-[color-mix(in_srgb,var(--accent-green)_22%,transparent)] text-[var(--text-primary)] no-underline";

interface FilesSearchRowProps {
  row: SearchRow;
  // The keyboard cursor sits here and the list has focus.
  cursor: boolean;
  // The occurrence open in the editor.
  opened: boolean;
  onClick: (row: SearchRow) => void;
  // Given while the replace field is open: the row's own Replace.
  onReplace?: (row: SearchRow) => void;
  // The file has unsaved edits in the editor, so nothing in it is replaced.
  unsaved?: boolean;
}

// A file with its count, or one occurrence under it: the line around it with
// the match marked, or struck through beside its replacement.
export const FilesSearchRow = memo(function FilesSearchRow({
  row,
  cursor,
  opened,
  onClick,
  onReplace,
  unsaved = false,
}: FilesSearchRowProps) {
  const base = `group flex cursor-pointer select-none items-center gap-1.5 pr-2.5 transition-colors ${
    opened ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
  } ${cursor ? "ring-1 ring-inset ring-[var(--accent-cyan)]/50" : ""}`;
  const isFile = row.kind === "file";
  const replaceButton = onReplace && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReplace(row);
      }}
      disabled={unsaved}
      title={unsaved ? "Save the file first" : isFile ? "Replace in this file" : "Replace"}
      aria-label={isFile ? "Replace in file" : "Replace"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:hover:bg-transparent ${
        unsaved
          ? cursor
            ? "opacity-40"
            : "opacity-0 group-hover:opacity-40"
          : cursor
            ? "opacity-100"
            : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      }`}
    >
      {isFile ? <ReplaceAll size={13} strokeWidth={1.8} /> : <Replace size={13} strokeWidth={1.8} />}
    </button>
  );

  if (row.kind === "file") {
    const name = row.path.slice(row.path.lastIndexOf("/") + 1);
    const dir = parentPath(row.path);
    return (
      <div
        role="treeitem"
        aria-level={1}
        aria-expanded={!row.collapsed}
        aria-selected={false}
        title={row.path}
        onClick={() => onClick(row)}
        style={{ height: SEARCH_ROW_PX, paddingLeft: BASE_LEFT_PX }}
        className={base}
      >
        <span className="flex w-3 shrink-0 justify-center">
          <TreeChevron open={!row.collapsed} />
        </span>
        <FileTypeIcon name={name} />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          {name}
          {dir && <span className="text-[var(--text-muted)]"> {dir}</span>}
        </span>
        {replaceButton}
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)] px-1.5 text-[10px] font-semibold text-[var(--text-secondary)]">
          {row.count.toLocaleString()}
        </span>
      </div>
    );
  }

  const { text, start, len, line, replacement } = row.match;
  // Trailing spaces would jump to the left edge of the right-to-left lead, so
  // they open the part with the match instead.
  const lead = text.slice(0, start).trimEnd();
  const gap = text.slice(lead.length, start);
  const shown = Math.min(len + (replacement?.length ?? 0), 24);
  // The match keeps its place in a narrow rail: the text after it gives way
  // first, then the lead, cut from the left.
  return (
    <div
      role="treeitem"
      aria-level={2}
      aria-selected={opened}
      title={`Line ${line}`}
      onClick={() => onClick(row)}
      style={{ height: SEARCH_ROW_PX, paddingLeft: BASE_LEFT_PX + INDENT_PX + 18 }}
      className={base}
    >
      <span className="flex min-w-0 flex-1 overflow-hidden font-mono text-[11px] text-[var(--text-secondary)] [tab-size:2]">
        {lead && (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre [direction:rtl]">
            <bdi dir="ltr">{lead}</bdi>
          </span>
        )}
        <span
          className="overflow-hidden text-ellipsis whitespace-pre"
          style={{ flex: "1 1 0%", minWidth: `${gap.length + shown + 1}ch` }}
        >
          {gap}
          {replacement === undefined ? (
            <mark className={MARK}>{text.slice(start, start + len)}</mark>
          ) : (
            <>
              <del className={REMOVED}>{text.slice(start, start + len)}</del>
              <ins className={ADDED}>{replacement}</ins>
            </>
          )}
          {text.slice(start + len)}
        </span>
      </span>
      {replaceButton}
    </div>
  );
});
