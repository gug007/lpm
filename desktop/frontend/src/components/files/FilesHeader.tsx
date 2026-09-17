import { Fragment, useRef, useState } from "react";
import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react";
import { basename } from "../../path";
import type { FilesTreeSide } from "../../store/settings";
import { CheckIcon, ChevronRightIcon, MoreHorizontalIcon } from "../icons";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { DirtyDot } from "../treeRow";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
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
  treeSide: FilesTreeSide;
  onSave: () => void;
  onRevealDir: (dir: string) => void;
  onToggleTree: () => void;
  onTreeSide: (side: FilesTreeSide) => void;
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
  treeSide,
  onSave,
  onRevealDir,
  onToggleTree,
  onTreeSide,
}: FilesHeaderProps) {
  const folders = path ? ancestorsOf(path) : [];
  const treeLabel = treeOpen ? "Hide file tree" : "Show file tree";
  const [sideMenu, setSideMenu] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const toggleMore = () => {
    if (sideMenu) {
      setSideMenu(null);
      return;
    }
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setSideMenu({ x: r.right, y: r.bottom + 4 });
  };
  const PanelIcon =
    treeSide === "left"
      ? treeOpen
        ? PanelLeftClose
        : PanelLeft
      : treeOpen
        ? PanelRightClose
        : PanelRight;

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
      <span
        className="inline-flex"
        onContextMenu={(e) => {
          e.preventDefault();
          setSideMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <Tooltip content={treeLabel} side="bottom">
          <button
            type="button"
            onClick={onToggleTree}
            aria-label={treeLabel}
            aria-pressed={treeOpen}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PanelIcon size={14} strokeWidth={1.75} />
          </button>
        </Tooltip>
      </span>
      {/* The mousedown must not reach the menu's outside-click listener, or a
          click on the open button would close and reopen it. */}
      <span className="inline-flex" onMouseDown={(e) => e.stopPropagation()}>
        <Tooltip content="More options" side="bottom" align="end">
          <button
            ref={moreRef}
            type="button"
            onClick={toggleMore}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={!!sideMenu}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
              sideMenu ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"
            }`}
          >
            <MoreHorizontalIcon />
          </button>
        </Tooltip>
        {sideMenu && (
          <ContextMenuShell
            x={sideMenu.x}
            y={sideMenu.y}
            align="end"
            minWidth={160}
            onClose={() => setSideMenu(null)}
          >
            {(["left", "right"] as const).map((side) => (
              <ContextMenuItem
                key={side}
                label={side === "left" ? "Tree on the left" : "Tree on the right"}
                trailing={treeSide === side ? <CheckIcon /> : undefined}
                onClick={() => {
                  setSideMenu(null);
                  onTreeSide(side);
                }}
              />
            ))}
          </ContextMenuShell>
        )}
      </span>
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
