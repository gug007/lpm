import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { XIcon } from "./icons";
import { main } from "../../bridge/models";
import { MonacoDiffPool, type MonacoDiffPoolHandle } from "./review/MonacoDiffPool";
import {
  buildTree,
  flattenNodes,
  fileDescendants,
  folderState,
  CheckboxBox,
  STATUS_DISPLAY,
  DEFAULT_STATUS,
  INDENT_PX,
  BASE_LEFT_PX,
  type FileNode,
  type FolderNode,
  type TreeNode,
} from "./ChangedFilesTree";

type ChangedFile = main.ChangedFile;

const BASE_DIFF_FONT_PX = 11;
const BASE_ZOOM = 1;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

interface Props {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  files: ChangedFile[];
  selected: Set<string>;
  onToggleFile: (path: string) => void;
  onSetSelection: (paths: string[], select: boolean) => void;
}

export function SideBySideDiffModal({
  open,
  onClose,
  projectPath,
  files,
  selected,
  onToggleFile,
  onSetSelection,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [zoom, setZoom] = useState(BASE_ZOOM);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const stackRef = useRef<MonacoDiffPoolHandle>(null);
  const wheelStateRef = useRef<{ delta: number; scheduled: boolean }>({
    delta: 0,
    scheduled: false,
  });

  const zoomIn = () =>
    setZoom((z) => clamp(+(z + ZOOM_STEP).toFixed(2), ZOOM_MIN, ZOOM_MAX));
  const zoomOut = () =>
    setZoom((z) => clamp(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN, ZOOM_MAX));
  const zoomReset = () => setZoom(BASE_ZOOM);

  const tree = useMemo(() => buildTree(files), [files]);
  // Render the diff stack in the same order the tree lists files.
  const orderedFiles = useMemo(() => flattenNodes(tree), [tree]);

  useEffect(() => {
    if (!open) return;
    setCollapsed(new Set());
    setActiveFile(orderedFiles[0]?.path ?? null);
    setConfirmDiscard(false);
    setDirtyCount(0);
  }, [open, orderedFiles]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); zoomReset(); }
    };
    // Trackpad pinch fires wheel events with ctrlKey=true in Chromium/WebKit;
    // Cmd/Ctrl + scroll-wheel is the equivalent on a mouse.
    // rAF-throttled so a 60Hz pinch gesture batches into one re-render per frame.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      wheelStateRef.current.delta += e.deltaY;
      if (wheelStateRef.current.scheduled) return;
      wheelStateRef.current.scheduled = true;
      requestAnimationFrame(() => {
        const d = wheelStateRef.current.delta;
        wheelStateRef.current = { delta: 0, scheduled: false };
        setZoom((z) => clamp(+(z - d * 0.01).toFixed(2), ZOOM_MIN, ZOOM_MAX));
      });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", onWheel);
    };
  }, [open]);

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleClickFile = (path: string) => {
    setActiveFile(path);
    stackRef.current?.scrollToFile(path);
  };

  // The diff is editable; closing unmounts the pool and discards unsaved edits,
  // and the commit stages from disk, so confirm before throwing edits away.
  const handleClose = () => {
    if (dirtyCount > 0) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      zIndexClassName="z-[110]"
      closeOnEscape={!confirmDiscard}
      closeOnBackdrop={!confirmDiscard}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="flex h-[90vh] w-[min(1480px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Review Changes
          <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5 text-[var(--text-muted)]">
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              title="Zoom out (⌘-)"
              className="rounded px-1.5 text-[13px] leading-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              −
            </button>
            <button
              onClick={zoomReset}
              title="Reset zoom (⌘0)"
              className="min-w-[42px] rounded px-1.5 text-[11px] tabular-nums transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              title="Zoom in (⌘+)"
              className="rounded px-1.5 text-[13px] leading-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[260px] shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-secondary)] py-1">
          {tree.map((n) => (
            <NavTreeNode
              key={n.path}
              node={n}
              depth={0}
              collapsed={collapsed}
              activeFile={activeFile}
              selected={selected}
              onToggleCollapse={toggleCollapse}
              onClickFile={handleClickFile}
              onToggleFile={onToggleFile}
              onSetSelection={onSetSelection}
            />
          ))}
        </div>

        <div className="min-w-0 min-h-0 flex-1">
          <MonacoDiffPool
            ref={stackRef}
            projectRoot={projectPath}
            files={orderedFiles}
            mode="working"
            baseBranch=""
            fontSize={BASE_DIFF_FONT_PX * zoom}
            active={open}
            selected={selected}
            authority="commit"
            onActiveFileChange={setActiveFile}
            onDirtyCountChange={setDirtyCount}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved edits?"
        body={`You have unsaved changes in ${dirtyCount} file${
          dirtyCount === 1 ? "" : "s"
        }. Closing will discard them — the commit only includes saved changes.`}
        cancelLabel="Keep editing"
        confirmLabel="Discard & close"
        variant="destructive"
        zIndexClassName="z-[120]"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </Modal>
  );
}

function NavTreeNode({
  node,
  depth,
  collapsed,
  activeFile,
  selected,
  onToggleCollapse,
  onClickFile,
  onToggleFile,
  onSetSelection,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  activeFile: string | null;
  selected: Set<string>;
  onToggleCollapse: (path: string) => void;
  onClickFile: (path: string) => void;
  onToggleFile: (path: string) => void;
  onSetSelection: (paths: string[], select: boolean) => void;
}) {
  if (node.kind === "file") {
    return (
      <NavFileRow
        node={node}
        depth={depth}
        active={activeFile === node.path}
        checked={selected.has(node.path)}
        onClick={onClickFile}
        onToggleFile={onToggleFile}
      />
    );
  }
  const isOpen = !collapsed.has(node.path);
  return (
    <div>
      <NavFolderRow
        node={node}
        depth={depth}
        isOpen={isOpen}
        selected={selected}
        onToggle={onToggleCollapse}
        onSetSelection={onSetSelection}
      />
      {isOpen &&
        node.children.map((c) => (
          <NavTreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            collapsed={collapsed}
            activeFile={activeFile}
            selected={selected}
            onToggleCollapse={onToggleCollapse}
            onClickFile={onClickFile}
            onToggleFile={onToggleFile}
            onSetSelection={onSetSelection}
          />
        ))}
    </div>
  );
}

function NavFolderRow({
  node,
  depth,
  isOpen,
  selected,
  onToggle,
  onSetSelection,
}: {
  node: FolderNode;
  depth: number;
  isOpen: boolean;
  selected: Set<string>;
  onToggle: (path: string) => void;
  onSetSelection: (paths: string[], select: boolean) => void;
}) {
  const state = folderState(node, selected);
  return (
    <div
      onClick={() => onToggle(node.path)}
      style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className="flex cursor-pointer items-center gap-2 py-[5px] pr-2.5 transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span
        className={`w-3 shrink-0 text-center text-[10px] text-[var(--text-muted)] transition-transform duration-150 ${
          isOpen ? "rotate-90" : ""
        }`}
      >
        &#9654;
      </span>
      <label
        className="flex shrink-0 cursor-pointer items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckboxBox state={state} />
        <input
          type="checkbox"
          checked={state === "all"}
          ref={(el) => {
            if (el) el.indeterminate = state === "some";
          }}
          onChange={() => onSetSelection(fileDescendants(node), state !== "all")}
          className="sr-only"
        />
      </label>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
        {node.name}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
        {node.fileCount}
      </span>
    </div>
  );
}

function NavFileRow({
  node,
  depth,
  active,
  checked,
  onClick,
  onToggleFile,
}: {
  node: FileNode;
  depth: number;
  active: boolean;
  checked: boolean;
  onClick: (path: string) => void;
  onToggleFile: (path: string) => void;
}) {
  const { label: statusLabel, color: statusClr } =
    STATUS_DISPLAY[node.file.status] ?? DEFAULT_STATUS;
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={rowRef}
      onClick={() => onClick(node.path)}
      style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer items-center gap-2 py-[5px] pr-2.5 transition-colors ${
        active
          ? "bg-[var(--accent-blue)]/15 text-[var(--text-primary)]"
          : "hover:bg-[var(--bg-hover)]"
      } ${!checked ? "opacity-50" : ""}`}
    >
      <span className="w-3 shrink-0" />
      <label
        className="flex shrink-0 cursor-pointer items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckboxBox state={checked ? "all" : "none"} />
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleFile(node.path)}
          className="sr-only"
        />
      </label>
      <span
        className={`w-3 shrink-0 text-center text-[11px] font-bold ${statusClr}`}
        title={node.file.status}
      >
        {statusLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
        {node.name}
      </span>
    </div>
  );
}
