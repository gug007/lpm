import { Fragment, useRef, useState } from "react";
import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react";
import type { ContentZoom } from "../../hooks/useContentZoom";
import { basename } from "../../path";
import type { FilesTreeSide } from "../../store/settings";
import { CheckIcon, ChevronRightIcon, MoreHorizontalIcon } from "../icons";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { DirtyDot } from "../treeRow";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Tooltip } from "../ui/Tooltip";
import { ZoomControl } from "../ui/ZoomControl";
import { decorationOf } from "./gitDecorations";
import { ancestorsOf } from "./treeModel";
import type { FileView, FileViewOption } from "./useFileView";

interface FilesHeaderProps {
  rootName: string;
  path: string | null;
  absPath: string | null;
  // The open file's git status, shown the way its tree row shows it.
  status?: string;
  // The views the open file has — diff against HEAD, rendered, source — when
  // there is more than one to choose from.
  view: FileView;
  viewOptions: readonly FileViewOption[] | null;
  onView: (view: FileView) => void;
  // Every change as one stack of diffs, in place of the open file.
  allChanges: boolean;
  // Reader zoom, for the views that have one: the diff stack and the preview.
  zoom: ContentZoom | null;
  sideBySide: boolean;
  onSideBySide: (sideBySide: boolean) => void;
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

const LAYOUT_OPTIONS = [
  { value: "split", label: "Split" },
  { value: "unified", label: "Unified" },
] as const;

const CRUMB_CLASS =
  "shrink-0 rounded px-1 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// The row above the editor: the open file's path as clickable folders, then
// the actions on it.
export function FilesHeader({
  rootName,
  path,
  absPath,
  status,
  view,
  viewOptions,
  onView,
  allChanges,
  zoom,
  sideBySide,
  onSideBySide,
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
  const folders = path && !allChanges ? ancestorsOf(path) : [];
  const decoration = status ? decorationOf(status) : null;
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
          {allChanges ? (
            <span className="shrink-0 px-1 text-xs font-medium text-[var(--text-primary)]">
              All changes
            </span>
          ) : path ? (
            <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium">
              <span className={decoration ? decoration.text : "text-[var(--text-primary)]"}>
                {basename(path)}
              </span>
              {decoration && (
                <span
                  className={`text-[11px] font-semibold ${decoration.text}`}
                  title={status}
                  aria-label={status}
                >
                  {decoration.letter}
                </span>
              )}
              {dirty && <DirtyDot />}
            </span>
          ) : (
            <span className="shrink-0 px-1 text-xs text-[var(--text-muted)]">Select a file</span>
          )}
        </div>
      </nav>
      {zoom && (
        <ZoomControl
          percent={zoom.percent}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          onReset={zoom.zoomReset}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
        />
      )}
      {allChanges ? (
        <SegmentedControl
          value={sideBySide ? "split" : "unified"}
          options={LAYOUT_OPTIONS}
          onChange={(layout) => onSideBySide(layout === "split")}
          variant="subtle"
          ariaLabel="Diff layout"
        />
      ) : (
        viewOptions && (
          <SegmentedControl
            value={view}
            options={viewOptions}
            onChange={onView}
            variant="subtle"
            ariaLabel="Editor view"
          />
        )
      )}
      {readOnly && path && !allChanges && (
        <span
          className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
          title="Files on an SSH host open read-only"
        >
          Read-only
        </span>
      )}
      {dirty && !readOnly && !allChanges && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {absPath && !allChanges && (
        <OpenFileWithDropdown absPath={absPath} line={0} col={0} compact />
      )}
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
