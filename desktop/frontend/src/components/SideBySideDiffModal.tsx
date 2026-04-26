import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import parseDiff from "parse-diff";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import {
  type Token,
  getLang,
  ensureLang,
  tokenizeLines,
} from "../highlight";
import {
  buildTree,
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

interface DiffLine {
  type: "context" | "add" | "del" | "empty";
  content: string;
  lineNo?: number;
  tokens?: Token[];
}

type FileStatus = "modified" | "added" | "deleted" | "renamed" | "binary";

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
  hunkHeader?: string;
}

interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  rows: DiffRow[];
}

/* ── Diff parser ───────────────────────────────────────────────── */

const stripPath = (p?: string) =>
  !p || p === "/dev/null" ? undefined : p;

function fileStatus(file: parseDiff.File): FileStatus {
  if (file.deleted) return "deleted";
  if (file.new) return "added";
  if (file.from && file.to && file.from !== file.to) return "renamed";
  // parse-diff returns no chunks for binary diffs ("Binary files ... differ").
  if (file.chunks.length === 0) return "binary";
  return "modified";
}

function parseSideBySide(raw: string): FileDiff[] {
  return parseDiff(raw)
    .map((file): FileDiff | null => {
      const from = stripPath(file.from);
      const to = stripPath(file.to);
      const path = to ?? from ?? "";
      if (!path) return null;
      const status = fileStatus(file);
      const oldPath = from && to && from !== to ? from : undefined;

      const rows: DiffRow[] = [];
      let dels: parseDiff.DeleteChange[] = [];
      let adds: parseDiff.AddChange[] = [];

      const flush = () => {
        const max = Math.max(dels.length, adds.length);
        for (let j = 0; j < max; j++) {
          rows.push({
            left:
              j < dels.length
                ? { type: "del", content: dels[j].content.slice(1), lineNo: dels[j].ln }
                : { type: "empty", content: "" },
            right:
              j < adds.length
                ? { type: "add", content: adds[j].content.slice(1), lineNo: adds[j].ln }
                : { type: "empty", content: "" },
          });
        }
        dels = [];
        adds = [];
      };

      file.chunks.forEach((chunk, i) => {
        if (i > 0) {
          rows.push({
            left: { type: "empty", content: "" },
            right: { type: "empty", content: "" },
            hunkHeader: chunk.content,
          });
        }
        for (const change of chunk.changes) {
          if (change.type === "normal") {
            flush();
            const content = change.content.slice(1);
            rows.push({
              left: { type: "context", content, lineNo: change.ln1 },
              right: { type: "context", content, lineNo: change.ln2 },
            });
          } else if (change.type === "del") {
            dels.push(change);
          } else {
            adds.push(change);
          }
        }
        flush();
      });

      return { path, oldPath, status, rows };
    })
    .filter((f): f is FileDiff => f !== null);
}

/* ── Syntax highlighting ───────────────────────────────────────── */
 
async function highlightDiffs(diffs: FileDiff[]): Promise<FileDiff[]> {
  return Promise.all(
    diffs.map(async (file) => {
      const lang = getLang(file.path);
      if (!lang || !(await ensureLang(lang))) return file;

      const leftLines: string[] = [];
      const rightLines: string[] = [];
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];

      file.rows.forEach((row, i) => {
        if (row.left.type !== "empty") {
          leftIdx.push(i);
          leftLines.push(row.left.content);
        }
        if (row.right.type !== "empty") {
          rightIdx.push(i);
          rightLines.push(row.right.content);
        }
      });

      const leftTokens = await tokenizeLines(leftLines.join("\n"), lang);
      const rightTokens = await tokenizeLines(rightLines.join("\n"), lang);

      const newRows: DiffRow[] = file.rows.map((r) => ({
        left: { ...r.left },
        right: { ...r.right },
      }));

      leftTokens.forEach((tokens, i) => {
        if (i < leftIdx.length) newRows[leftIdx[i]].left.tokens = tokens;
      });
      rightTokens.forEach((tokens, i) => {
        if (i < rightIdx.length) newRows[rightIdx[i]].right.tokens = tokens;
      });

      return { ...file, rows: newRows };
    }),
  );
}

/* ── Rendering helpers ─────────────────────────────────────────── */

const rowBg = (type: DiffLine["type"]) => {
  switch (type) {
    case "add":
      return "bg-green-500/10";
    case "del":
      return "bg-red-500/10";
    case "empty":
      return "bg-[var(--bg-secondary)]";
    default:
      return "";
  }
};

const BASE_ZOOM = 1;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
const BASE_DIFF_FONT_PX = 11;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const STATUS_BADGE: Record<FileStatus, string> = {
  modified: "",
  added: "bg-green-500/15 text-green-400",
  deleted: "bg-red-500/15 text-red-400",
  renamed: "bg-blue-500/15 text-blue-400",
  binary: "bg-[var(--bg-hover)] text-[var(--text-muted)]",
};

function HunkSeparator({ header }: { header: string }) {
  return (
    <div className="sticky left-0 flex bg-[var(--bg-secondary)] text-[var(--text-muted)]">
      <span className="truncate px-3 py-0.5 text-[0.85em] italic">
        {header}
      </span>
    </div>
  );
}

function DiffSide({
  rows,
  side,
  withBorder,
}: {
  rows: DiffRow[];
  side: "left" | "right";
  withBorder?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 overflow-x-auto ${withBorder ? "border-r border-[var(--border)]" : ""}`}
    >
      {rows.map((row, i) => {
        if (row.hunkHeader) return <HunkSeparator key={i} header={row.hunkHeader} />;
        const line = side === "left" ? row.left : row.right;
        return (
          <div key={i} className={`flex w-max min-w-full ${rowBg(line.type)}`}>
            <span className="sticky left-0 z-[1] w-10 shrink-0 select-none bg-inherit pr-2 text-right text-[0.9em] text-[var(--text-muted)]/40">
              {line.lineNo ?? ""}
            </span>
            <span className="whitespace-pre pr-4">{renderContent(line)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderContent(line: DiffLine): ReactNode {
  if (line.type === "empty") return " ";
  if (line.tokens && line.tokens.length > 0) {
    return line.tokens.map((t, i) => (
      <span key={i} style={t.color ? { color: t.color } : undefined}>
        {t.content}
      </span>
    ));
  }
  return line.content || " ";
}

/* ── Component ─────────────────────────────────────────────────── */

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
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [zoom, setZoom] = useState(BASE_ZOOM);
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const wheelStateRef = useRef<{ delta: number; scheduled: boolean }>({
    delta: 0,
    scheduled: false,
  });

  const zoomIn = () =>
    setZoom((z) => clamp(+(z + ZOOM_STEP).toFixed(2), ZOOM_MIN, ZOOM_MAX));
  const zoomOut = () =>
    setZoom((z) => clamp(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN, ZOOM_MAX));
  const zoomReset = () => setZoom(BASE_ZOOM);

  const filePaths = useMemo(() => files.map((f) => f.path), [files]);
  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    if (!open) return;
    setCollapsed(new Set());
    setActiveFile(files[0]?.path ?? null);
  }, [open, files]);

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

  useEffect(() => {
    if (!open || filePaths.length === 0) return;
    let cancelled = false;
    setLoading(true);
    GitDiff(projectPath, filePaths)
      .then(async (raw) => {
        if (cancelled) return;
        const parsed = parseSideBySide(raw);
        setFileDiffs(parsed);
        setLoading(false);
        const highlighted = await highlightDiffs(parsed);
        if (!cancelled) setFileDiffs(highlighted);
      })
      .catch(() => {
        if (!cancelled) {
          setFileDiffs([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectPath, filePaths]);

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
    diffRefs.current
      .get(path)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[110]"
      containerClassName="!items-start"
      contentClassName="mt-10 w-screen h-[calc(100vh-1.75rem)] flex flex-col bg-[var(--bg-primary)]"
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
            onClick={onClose}
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

        <div className="min-w-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
              Loading diffs...
            </div>
          )}
          {!loading && fileDiffs.length === 0 && (
            <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
              No changes to display
            </div>
          )}
          {!loading &&
            fileDiffs.map((file) => (
              <div
                key={file.path}
                ref={(el) => {
                  if (el) diffRefs.current.set(file.path, el);
                  else diffRefs.current.delete(file.path);
                }}
                className={`border-b border-[var(--border)] last:border-b-0 ${
                  selected.has(file.path) ? "" : "opacity-60"
                }`}
              >
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]">
                  {file.status === "renamed" && file.oldPath && (
                    <span className="text-[var(--text-muted)]">
                      {file.oldPath} →
                    </span>
                  )}
                  <span className="truncate">{file.path}</span>
                  {file.status !== "modified" && (
                    <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${STATUS_BADGE[file.status]}`}>
                      {file.status}
                    </span>
                  )}
                  {!selected.has(file.path) && (
                    <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
                      (excluded)
                    </span>
                  )}
                </div>
                {file.status === "binary" ? (
                  <div className="px-4 py-3 text-[11px] italic text-[var(--text-muted)]">
                    Binary file — diff not shown
                  </div>
                ) : (
                  <div
                    className="flex font-mono leading-[1.6]"
                    style={{ fontSize: `${BASE_DIFF_FONT_PX * zoom}px` }}
                  >
                    <DiffSide rows={file.rows} side="left" withBorder />
                    <DiffSide rows={file.rows} side="right" />
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
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
          onChange={() =>
            onSetSelection(fileDescendants(node), state !== "all")
          }
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
  return (
    <div
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
