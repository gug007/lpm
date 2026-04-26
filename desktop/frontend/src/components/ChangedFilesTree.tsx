import { useMemo } from "react";
import { main } from "../../wailsjs/go/models";
import { UndoIcon } from "./icons";
import { DiffViewer } from "./DiffViewer";

type ChangedFile = main.ChangedFile;

export const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  added: { label: "A", color: "text-[var(--accent-green-text)]" },
  untracked: { label: "U", color: "text-[var(--accent-green-text)]" },
  deleted: { label: "D", color: "text-[var(--accent-red-text)]" },
  renamed: { label: "R", color: "text-[var(--accent-cyan-text)]" },
  modified: { label: "M", color: "text-[var(--accent-blue-text)]" },
};
export const DEFAULT_STATUS = STATUS_DISPLAY.modified;
export const INDENT_PX = 14;
export const BASE_LEFT_PX = 10;

export type FileNode = {
  kind: "file";
  path: string;
  name: string;
  file: ChangedFile;
};
export type FolderNode = {
  kind: "folder";
  path: string;
  name: string;
  children: TreeNode[];
  fileCount: number;
};
export type TreeNode = FileNode | FolderNode;

export function buildTree(files: ChangedFile[]): TreeNode[] {
  const root: FolderNode = {
    kind: "folder",
    path: "",
    name: "",
    children: [],
    fileCount: 0,
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      let child = current.children.find(
        (c): c is FolderNode =>
          c.kind === "folder" && c.name === folderName,
      );
      if (!child) {
        child = {
          kind: "folder",
          path: folderPath,
          name: folderName,
          children: [],
          fileCount: 0,
        };
        current.children.push(child);
      }
      current = child;
    }

    current.children.push({
      kind: "file",
      path: file.path,
      name: parts[parts.length - 1],
      file,
    });
  }

  return root.children.map(collapseAndSort);
}

function collapseAndSort(node: TreeNode): TreeNode {
  if (node.kind === "file") return node;

  const processed = node.children.map(collapseAndSort);

  if (processed.length === 1 && processed[0].kind === "folder") {
    const child = processed[0];
    return {
      kind: "folder",
      path: child.path,
      name: `${node.name}/${child.name}`,
      children: child.children,
      fileCount: child.fileCount,
    };
  }

  const sorted = [...processed].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const fileCount = sorted.reduce(
    (acc, c) => acc + (c.kind === "file" ? 1 : c.fileCount),
    0,
  );

  return {
    kind: "folder",
    path: node.path,
    name: node.name,
    children: sorted,
    fileCount,
  };
}

export function fileDescendants(node: TreeNode): string[] {
  if (node.kind === "file") return [node.path];
  return node.children.flatMap(fileDescendants);
}

export function folderState(
  node: FolderNode,
  selected: Set<string>,
): CheckState {
  const paths = fileDescendants(node);
  let count = 0;
  for (const p of paths) if (selected.has(p)) count++;
  if (count === 0) return "none";
  if (count === paths.length) return "all";
  return "some";
}

export type CheckState = "none" | "some" | "all";

export function CheckboxBox({ state }: { state: CheckState }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
        state === "none"
          ? "border-[var(--text-muted)]/25"
          : "border-[var(--accent-blue)] text-[var(--accent-blue)]"
      }`}
    >
      {state === "all" && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {state === "some" && (
        <span className="h-[2px] w-[8px] rounded-full bg-current" />
      )}
    </span>
  );
}

interface ChangedFilesTreeProps {
  files: ChangedFile[];
  selected: Set<string>;
  collapsed: Set<string>;
  expandedFile: string | null;
  diffContent: string;
  diffLoading: boolean;
  busy: boolean;
  onToggleFile: (path: string) => void;
  onSetSelection: (paths: string[], select: boolean) => void;
  onToggleCollapse: (path: string) => void;
  onClickFile: (path: string) => void;
  onDiscardFile: (path: string) => void;
  onDiscardFolder: (info: { name: string; paths: string[] }) => void;
}

export function ChangedFilesTree(props: ChangedFilesTreeProps) {
  const tree = useMemo(() => buildTree(props.files), [props.files]);

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.kind === "file") {
      return (
        <FileRow
          key={node.path}
          node={node}
          depth={depth}
          selected={props.selected}
          expandedFile={props.expandedFile}
          diffContent={props.diffContent}
          diffLoading={props.diffLoading}
          busy={props.busy}
          onToggleFile={props.onToggleFile}
          onClickFile={props.onClickFile}
          onDiscardFile={props.onDiscardFile}
        />
      );
    }
    const isOpen = !props.collapsed.has(node.path);
    return (
      <div key={node.path}>
        <FolderRow
          node={node}
          depth={depth}
          isOpen={isOpen}
          selected={props.selected}
          busy={props.busy}
          onSetSelection={props.onSetSelection}
          onToggleCollapse={props.onToggleCollapse}
          onDiscardFolder={props.onDiscardFolder}
        />
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return <>{tree.map((n) => renderNode(n, 0))}</>;
}

function FolderRow({
  node,
  depth,
  isOpen,
  selected,
  busy,
  onSetSelection,
  onToggleCollapse,
  onDiscardFolder,
}: {
  node: FolderNode;
  depth: number;
  isOpen: boolean;
  selected: Set<string>;
  busy: boolean;
  onSetSelection: (paths: string[], select: boolean) => void;
  onToggleCollapse: (path: string) => void;
  onDiscardFolder: (info: { name: string; paths: string[] }) => void;
}) {
  const state = folderState(node, selected);
  return (
    <div
      onClick={() => onToggleCollapse(node.path)}
      style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className="group flex cursor-pointer items-center gap-2 py-[5px] pr-2.5 transition-colors hover:bg-[var(--bg-hover)]"
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
          disabled={busy}
          className="sr-only"
        />
      </label>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
        {node.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDiscardFolder({ name: node.name, paths: fileDescendants(node) });
        }}
        disabled={busy}
        title="Discard all changes in this folder"
        className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-red-text)] group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
      >
        <UndoIcon />
      </button>
      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
        {node.fileCount}
      </span>
    </div>
  );
}

function FileRow({
  node,
  depth,
  selected,
  expandedFile,
  diffContent,
  diffLoading,
  busy,
  onToggleFile,
  onClickFile,
  onDiscardFile,
}: {
  node: FileNode;
  depth: number;
  selected: Set<string>;
  expandedFile: string | null;
  diffContent: string;
  diffLoading: boolean;
  busy: boolean;
  onToggleFile: (path: string) => void;
  onClickFile: (path: string) => void;
  onDiscardFile: (path: string) => void;
}) {
  const checked = selected.has(node.path);
  const { label: statusLabel, color: statusClr } =
    STATUS_DISPLAY[node.file.status] ?? DEFAULT_STATUS;
  const isExpanded = expandedFile === node.path;
  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
        className={`group flex items-center gap-2 py-[5px] pr-2.5 transition-colors hover:bg-[var(--bg-hover)] ${
          !checked ? "opacity-50" : ""
        }`}
      >
        <span className="w-3 shrink-0" />
        <label className="flex shrink-0 cursor-pointer items-center">
          <CheckboxBox state={checked ? "all" : "none"} />
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleFile(node.path)}
            disabled={busy}
            className="sr-only"
          />
        </label>
        <span
          className={`w-3 shrink-0 text-center text-[11px] font-bold ${statusClr}`}
          title={node.file.status}
        >
          {statusLabel}
        </span>
        <span
          onClick={() => onClickFile(node.path)}
          className="min-w-0 flex-1 cursor-pointer truncate text-xs text-[var(--text-primary)]"
        >
          {node.name}
        </span>
        <button
          onClick={() => onDiscardFile(node.path)}
          disabled={busy}
          title="Discard changes to this file"
          className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--accent-red-text)] group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
        >
          <UndoIcon />
        </button>
        <span
          className={`shrink-0 text-[11px] text-[var(--text-muted)] transition-transform duration-150 ${
            isExpanded ? "rotate-90" : ""
          }`}
        >
          &#9654;
        </span>
      </div>
      {isExpanded && (
        <DiffViewer
          diff={diffContent}
          loading={diffLoading}
          filePath={node.path}
        />
      )}
    </div>
  );
}
