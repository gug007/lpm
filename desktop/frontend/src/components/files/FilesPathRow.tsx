import type { LocatedPath } from "../../locate";
import { basename, folderAbove } from "../../path";
import { stripMarker } from "../../peer/markers";
import { FolderIcon } from "../icons";
import { BASE_LEFT_PX } from "../treeRow";
import { FileTypeIcon } from "./FileTypeIcon";
import { FILES_ROW_PX } from "./FilesRow";
import { parentPath } from "./treeModel";
import { inTree } from "./typedPath";

interface FilesPathRowProps {
  // null while it is looked for.
  at: LocatedPath | null;
  // The SSH host the path is on.
  hostName: string | null;
  // What the folder holds is listed under the row.
  listed?: boolean;
  onOpen: () => void;
}

const ROW = "flex w-full select-none items-center gap-1.5 pr-2.5 text-left text-xs";

// The path typed in the filter box, above what its text also matches.
export function FilesPathRow({ at, hostName, listed = false, onOpen }: FilesPathRowProps) {
  const style = { height: FILES_ROW_PX, paddingLeft: `${BASE_LEFT_PX}px` };
  if (!at) {
    return (
      <p role="status" style={style} className={`${ROW} justify-center text-[11px] text-[var(--text-muted)]`}>
        {hostName ? `Looking on ${hostName}…` : "Looking…"}
      </p>
    );
  }
  const { kind, rel, path } = at;
  // Empty for the top of a filesystem.
  const name = basename(path);
  const isDir = kind === "dir";
  const blocked = listed ? "Outside the project" : isDir && rel !== null && !inTree(rel) ? "Not in the tree" : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={blocked !== null}
      title={stripMarker(path)}
      style={style}
      className={`${ROW} text-[var(--text-primary)] transition-colors enabled:hover:bg-[var(--bg-hover)]`}
    >
      {isDir ? (
        <span className="flex w-[26px] shrink-0 items-center justify-center text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
          <FolderIcon />
        </span>
      ) : (
        <FileTypeIcon name={name} />
      )}
      <span className="min-w-0 truncate">{name || stripMarker(path)}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
        {rel === null ? name && stripMarker(folderAbove(path) ?? path) : parentPath(rel)}
      </span>
      <span className={`text-[11px] text-[var(--text-muted)] ${listed ? "min-w-0 shrink-[8] truncate" : "shrink-0"}`}>
        {blocked ?? (isDir && rel !== null ? "↵ Show in tree" : "↵ Open")}
      </span>
    </button>
  );
}
