"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ChangedFile } from "./projects";
import { FOCUS_RING } from "./ui";

const INDENT_PX = 14;
const BASE_LEFT_PX = 10;

const STATUS = {
  modified: { label: "M", color: "text-[#60a5fa]" },
  added: { label: "A", color: "text-[#4ade80]" },
  deleted: { label: "D", color: "text-[#f87171]" },
} as const;

type FileNode = { kind: "file"; name: string; file: ChangedFile };
type FolderNode = {
  kind: "folder";
  path: string;
  name: string;
  children: TreeNode[];
  fileCount: number;
};
type TreeNode = FileNode | FolderNode;

function buildTree(files: ChangedFile[]): TreeNode[] {
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
      const name = parts[i];
      let child = current.children.find(
        (c): c is FolderNode => c.kind === "folder" && c.name === name,
      );
      if (!child) {
        child = {
          kind: "folder",
          path: parts.slice(0, i + 1).join("/"),
          name,
          children: [],
          fileCount: 0,
        };
        current.children.push(child);
      }
      current = child;
    }
    current.children.push({
      kind: "file",
      name: parts[parts.length - 1],
      file,
    });
  }

  return root.children.map(collapseAndSort);
}

// A folder holding nothing but one folder collapses into an "a/b" row, the way
// the app's tree does, so a deep source path doesn't eat the whole sidebar.
function collapseAndSort(node: TreeNode): TreeNode {
  if (node.kind === "file") return node;

  const processed = node.children.map(collapseAndSort);
  if (processed.length === 1 && processed[0].kind === "folder") {
    const child = processed[0];
    return { ...child, name: `${node.name}/${child.name}` };
  }

  const sorted = [...processed].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    kind: "folder",
    path: node.path,
    name: node.name,
    children: sorted,
    fileCount: sorted.reduce(
      (acc, c) => acc + (c.kind === "file" ? 1 : c.fileCount),
      0,
    ),
  };
}

export function ReviewFileTree({
  files,
  selectedPath,
  onSelect,
}: {
  files: ChangedFile[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const padding = { paddingLeft: `${depth * INDENT_PX + BASE_LEFT_PX}px` };

    if (node.kind === "file") {
      const status = STATUS[node.file.status];
      const active = node.file.path === selectedPath;
      return (
        <button
          key={node.file.path}
          type="button"
          onClick={() => onSelect(node.file.path)}
          style={padding}
          className={`flex w-full items-center gap-2 py-[5px] pr-2.5 text-left transition-colors ${FOCUS_RING} ${
            active ? "bg-[#333333]" : "hover:bg-[#2a2a2a]"
          }`}
        >
          <span className="w-3 shrink-0" />
          <span
            title={node.file.status}
            className={`w-3 shrink-0 text-center text-[11px] font-bold ${status.color}`}
          >
            {status.label}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-xs ${
              active ? "text-[#e5e5e5]" : "text-[#b3b3b3]"
            }`}
          >
            {node.name}
          </span>
        </button>
      );
    }

    const open = !collapsed.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          aria-expanded={open}
          style={padding}
          className={`flex w-full items-center gap-2 py-[5px] pr-2.5 text-left transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING}`}
        >
          <span
            className={`w-3 shrink-0 text-center text-[10px] text-[#919191] transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          >
            &#9654;
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-[#b3b3b3]">
            {node.name}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">
            {node.fileCount}
          </span>
        </button>
        {open && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return <div className="py-1">{tree.map((node) => renderNode(node, 0))}</div>;
}
