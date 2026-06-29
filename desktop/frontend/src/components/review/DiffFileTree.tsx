import { useMemo, useState } from "react";
import { main } from "../../../bridge/models";
import {
  BASE_LEFT_PX,
  DEFAULT_STATUS,
  FolderNode,
  FileNode,
  INDENT_PX,
  STATUS_DISPLAY,
  TreeNode,
  buildTree,
} from "../ChangedFilesTree";

type ChangedFile = main.ChangedFile;

interface DiffFileTreeProps {
  files: ChangedFile[];
  selectedPath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (path: string) => void;
}

export function DiffFileTree({
  files,
  selectedPath,
  dirtyPaths,
  onSelect,
}: DiffFileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.kind === "file") {
      return (
        <FileRow
          key={node.path}
          node={node}
          depth={depth}
          active={selectedPath === node.path}
          dirty={dirtyPaths.has(node.path)}
          onSelect={onSelect}
        />
      );
    }
    const isOpen = !collapsed.has(node.path);
    return (
      <div key={node.path}>
        <FolderRow
          node={node}
          depth={depth}
          isOpen={isOpen}
          onToggle={() => toggleCollapse(node.path)}
        />
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return <div className="py-1">{tree.map((n) => renderNode(n, 0))}</div>;
}

function FolderRow({
  node,
  depth,
  isOpen,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
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
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
        {node.name}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
        {node.fileCount}
      </span>
    </div>
  );
}

function FileRow({
  node,
  depth,
  active,
  dirty,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  active: boolean;
  dirty: boolean;
  onSelect: (path: string) => void;
}) {
  const { label: statusLabel, color: statusClr } =
    STATUS_DISPLAY[node.file.status] ?? DEFAULT_STATUS;
  return (
    <div
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` }}
      className={`flex cursor-pointer items-center gap-2 py-[5px] pr-2.5 transition-colors ${
        active ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className="w-3 shrink-0" />
      <span
        className={`w-3 shrink-0 text-center text-[11px] font-bold ${statusClr}`}
        title={node.file.status}
        aria-label={node.file.status}
      >
        {statusLabel}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-xs ${
          active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {node.name}
      </span>
      {dirty && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
          title="Unsaved changes"
        />
      )}
    </div>
  );
}
