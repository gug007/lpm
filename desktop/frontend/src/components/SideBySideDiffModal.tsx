import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import {
  type Token,
  DIFF_META_PREFIXES,
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

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
}

interface FileDiff {
  path: string;
  rows: DiffRow[];
}

/* ── Diff parser ───────────────────────────────────────────────── */

function parseSideBySide(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const chunks = raw.split(/(?=^diff --git )/m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const match = lines[0].match(/diff --git a\/.*? b\/(.*)/);
    const path = match?.[1] ?? "";

    const rows: DiffRow[] = [];
    let leftNo = 0,
      rightNo = 0;
    let dels: string[] = [],
      adds: string[] = [];

    const flush = () => {
      const max = Math.max(dels.length, adds.length);
      for (let j = 0; j < max; j++) {
        rows.push({
          left:
            j < dels.length
              ? { type: "del", content: dels[j].slice(1), lineNo: ++leftNo }
              : { type: "empty", content: "" },
          right:
            j < adds.length
              ? { type: "add", content: adds[j].slice(1), lineNo: ++rightNo }
              : { type: "empty", content: "" },
        });
      }
      dels = [];
      adds = [];
    };

    for (const line of lines) {
      if (line.startsWith("@@")) {
        flush();
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          leftNo = parseInt(m[1]) - 1;
          rightNo = parseInt(m[2]) - 1;
        }
        continue;
      }
      if (DIFF_META_PREFIXES.some((p) => line.startsWith(p))) continue;

      if (line.startsWith("-")) {
        dels.push(line);
      } else if (line.startsWith("+")) {
        adds.push(line);
      } else {
        flush();
        const content = line.startsWith(" ") ? line.slice(1) : line;
        rows.push({
          left: { type: "context", content, lineNo: ++leftNo },
          right: { type: "context", content, lineNo: ++rightNo },
        });
      }
    }
    flush();

    if (path) files.push({ path, rows });
  }

  return files;
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
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const filePaths = useMemo(() => files.map((f) => f.path), [files]);
  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    if (!open) return;
    setCollapsed(new Set());
    setActiveFile(files[0]?.path ?? null);
  }, [open, files]);

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
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
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
                <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]">
                  {file.path}
                  {!selected.has(file.path) && (
                    <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
                      (excluded)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 font-mono text-[11px] leading-[1.6]">
                  {file.rows.map((row, i) => (
                    <Fragment key={i}>
                      <div
                        className={`flex min-w-0 overflow-x-auto border-r border-[var(--border)] ${rowBg(row.left.type)}`}
                      >
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]/40">
                          {row.left.lineNo ?? ""}
                        </span>
                        <span className="flex-1 whitespace-pre">
                          {renderContent(row.left)}
                        </span>
                      </div>
                      <div
                        className={`flex min-w-0 overflow-x-auto ${rowBg(row.right.type)}`}
                      >
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]/40">
                          {row.right.lineNo ?? ""}
                        </span>
                        <span className="flex-1 whitespace-pre">
                          {renderContent(row.right)}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
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
