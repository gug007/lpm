"use client";

import { memo } from "react";
import { FileTypeIcon } from "./file-type-icon";
import type { TreeRow } from "./files-model";
import { decorationOf, type GitStatus } from "./git-decorations";

export const INDENT_PX = 14;
export const BASE_LEFT_PX = 10;

export const FilesRow = memo(function FilesRow({
  row,
  selected,
  cursor,
  status,
  onActivate,
}: {
  row: TreeRow;
  selected: boolean;
  // The keyboard cursor sits here and the list has focus.
  cursor: boolean;
  // The git status of the file, or of the changes inside the folder.
  status?: GitStatus;
  onActivate: (row: TreeRow) => void;
}) {
  const decoration = status ? decorationOf(status) : null;
  const nameClass = decoration
    ? `${decoration.text}${decoration.strike ? " line-through" : ""}`
    : selected
      ? "text-[#e5e5e5]"
      : "text-[#b3b3b3]";
  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.isDir ? row.expanded : undefined}
      onClick={() => onActivate(row)}
      style={{ paddingLeft: `${row.depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer select-none items-center gap-1.5 py-[5px] pr-2.5 transition-colors ${
        selected ? "bg-[#333333]" : "hover:bg-[#2a2a2a]"
      } ${cursor ? "ring-1 ring-inset ring-[#22d3ee]/50" : ""}`}
    >
      {row.isDir ? (
        <span className="flex w-[26px] shrink-0 items-center justify-center">
          <span
            aria-hidden
            className={`w-3 shrink-0 text-center text-[10px] text-[#919191] transition-transform duration-150 ${
              row.expanded ? "rotate-90" : ""
            }`}
          >
            &#9654;
          </span>
        </span>
      ) : (
        <FileTypeIcon name={row.name} />
      )}
      <span className={`min-w-0 flex-1 truncate text-xs ${nameClass}`}>{row.name}</span>
      {status && (row.isDir ? <ChangeDot status={status} /> : <StatusMark status={status} />)}
    </div>
  );
});

function StatusMark({ status }: { status: GitStatus }) {
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

function ChangeDot({ status }: { status: GitStatus }) {
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
