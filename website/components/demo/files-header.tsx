"use client";

import { Fragment } from "react";
import { ChevronRight, PanelRight, PanelRightClose } from "lucide-react";
import { ancestorsOf, basename } from "./files-model";
import { decorationOf, type GitStatus } from "./git-decorations";
import { Tooltip } from "./tooltip";
import { SegmentedControl } from "./ui-kit";
import { FOCUS_RING } from "./ui";
import type { FileView, FileViewOption, ReaderZoom } from "./use-file-view";
import { ZoomControl } from "./zoom-control";

const CRUMB_CLASS =
  "shrink-0 rounded px-1 py-0.5 text-xs text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]";

// The row above the editor: the open file's path as clickable folders, then the
// actions on it.
export function FilesHeader({
  rootName,
  path,
  status,
  view,
  viewOptions,
  onView,
  zoom,
  treeOpen,
  onRevealDir,
  onToggleTree,
}: {
  rootName: string;
  path: string | null;
  // The open file's git status, shown the way its tree row shows it.
  status?: GitStatus;
  // The views the open file has — diff against HEAD, rendered, source — when
  // there is more than one to choose from.
  view: FileView;
  viewOptions: readonly FileViewOption[] | null;
  onView: (view: FileView) => void;
  // Reader zoom, for the view that has one: the Markdown preview.
  zoom: ReaderZoom | null;
  treeOpen: boolean;
  onRevealDir: (dir: string) => void;
  onToggleTree: () => void;
}) {
  const folders = path ? ancestorsOf(path) : [];
  const decoration = status ? decorationOf(status) : null;
  const treeLabel = treeOpen ? "Hide file tree" : "Show file tree";
  const PanelIcon = treeOpen ? PanelRightClose : PanelRight;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#2e2e2e] bg-[#242424]/20 px-2">
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
            className={`${CRUMB_CLASS} ${FOCUS_RING}`}
          >
            {rootName}
          </button>
          {folders.map((dir) => (
            <Fragment key={dir}>
              <Separator />
              <button
                type="button"
                onClick={() => onRevealDir(dir)}
                className={`${CRUMB_CLASS} ${FOCUS_RING}`}
              >
                {basename(dir)}
              </button>
            </Fragment>
          ))}
          <Separator />
          {path ? (
            <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium">
              <span className={decoration ? decoration.text : "text-[#e5e5e5]"}>
                {basename(path)}
              </span>
              {decoration && (
                <span
                  className={`text-[11px] font-semibold ${decoration.text}`}
                  aria-label={status}
                >
                  {decoration.letter}
                </span>
              )}
            </span>
          ) : (
            <span className="shrink-0 px-1 text-xs text-[#919191]">Select a file</span>
          )}
        </div>
      </nav>
      {zoom && (
        <ZoomControl
          percent={zoom.percent}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          onReset={zoom.reset}
        />
      )}
      {viewOptions && (
        <SegmentedControl<FileView>
          value={view}
          options={viewOptions}
          onChange={onView}
          ariaLabel="Editor view"
          className="shrink-0"
        />
      )}
      <div className="h-4 w-px shrink-0 bg-[#2e2e2e]" />
      <Tooltip content={treeLabel} side="bottom">
        <button
          type="button"
          onClick={onToggleTree}
          aria-label={treeLabel}
          aria-pressed={treeOpen}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
        >
          <PanelIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </Tooltip>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="shrink-0 text-[#919191] opacity-60">
      <ChevronRight className="h-3 w-3" />
    </span>
  );
}
