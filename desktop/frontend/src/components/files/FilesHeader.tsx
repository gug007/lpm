import { Fragment } from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import { basename } from "../../path";
import { ChevronRightIcon } from "../icons";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { DirtyDot } from "../treeRow";
import { Tooltip } from "../ui/Tooltip";
import { ancestorsOf } from "./treeModel";

interface FilesHeaderProps {
  rootName: string;
  path: string | null;
  absPath: string | null;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  treeOpen: boolean;
  onSave: () => void;
  onRevealDir: (dir: string) => void;
  onToggleTree: () => void;
}

const CRUMB_CLASS =
  "shrink-0 rounded px-1 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// The row above the editor: the open file's path as clickable folders, then
// the actions on it.
export function FilesHeader({
  rootName,
  path,
  absPath,
  dirty,
  saving,
  readOnly,
  treeOpen,
  onSave,
  onRevealDir,
  onToggleTree,
}: FilesHeaderProps) {
  const folders = path ? ancestorsOf(path) : [];
  const treeLabel = treeOpen ? "Hide file tree" : "Show file tree";

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20 px-2">
      {/* The auto margin keeps the trail left while it fits; once it overflows
          the margin collapses and the end alignment keeps the file name in
          view, clipping the project name instead. */}
      <nav
        aria-label="File path"
        className="flex min-w-0 flex-1 items-center justify-end overflow-hidden"
      >
        <div className="mr-auto flex shrink-0 items-center whitespace-nowrap">
          <button
            type="button"
            onClick={() => onRevealDir("")}
            className={CRUMB_CLASS}
            title="Show the project root"
          >
            {rootName}
          </button>
          {folders.map((dir) => (
            <Fragment key={dir}>
              <Separator />
              <button
                type="button"
                onClick={() => onRevealDir(dir)}
                className={CRUMB_CLASS}
                title={dir}
              >
                {basename(dir)}
              </button>
            </Fragment>
          ))}
          <Separator />
          {path ? (
            <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium text-[var(--text-primary)]">
              {basename(path)}
              {dirty && <DirtyDot />}
            </span>
          ) : (
            <span className="shrink-0 px-1 text-xs text-[var(--text-muted)]">Select a file</span>
          )}
        </div>
      </nav>
      {readOnly && path && (
        <span
          className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
          title="Files on an SSH host open read-only"
        >
          Read-only
        </span>
      )}
      {dirty && !readOnly && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {absPath && <OpenFileWithDropdown absPath={absPath} line={0} col={0} compact />}
      <div className="h-4 w-px shrink-0 bg-[var(--border)]" />
      <Tooltip content={treeLabel} side="bottom">
        <button
          type="button"
          onClick={onToggleTree}
          aria-label={treeLabel}
          aria-pressed={treeOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {treeOpen ? (
            <PanelRightClose size={14} strokeWidth={1.75} />
          ) : (
            <PanelRight size={14} strokeWidth={1.75} />
          )}
        </button>
      </Tooltip>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="shrink-0 text-[var(--text-muted)] opacity-60 [&>svg]:h-3 [&>svg]:w-3">
      <ChevronRightIcon />
    </span>
  );
}
