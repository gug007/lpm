import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import { isBinary } from "../seed/sample";
import { demoDirsIn, fileEditCommands } from "./fileEdits";
import { projectAt, project, type Project } from "./state";

export function tree(root: unknown): Record<string, string> {
  return project(String(root))?.files ?? projectAt(String(root))?.files ?? {};
}

function locate(absPath: string): { p: Project; rel: string } | null {
  const p = projectAt(absPath);
  return p && absPath !== p.root ? { p, rel: absPath.slice(p.root.length + 1) } : null;
}

export function dirEntries(files: Record<string, string>, rel = "") {
  const prefix = rel ? `${rel}/` : "";
  const found = new Map<string, boolean>();
  for (const path of Object.keys(files)) {
    if (!path.startsWith(prefix)) continue;
    const [head, ...below] = path.slice(prefix.length).split("/");
    found.set(head, (found.get(head) ?? false) || below.length > 0);
  }
  return [...found]
    .map(([name, isDir]) => ({ name, isDir, isSymlink: false, isIgnored: false }))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

function allPaths(files: Record<string, string>) {
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return [
    ...[...dirs].map((path) => ({ path, isDir: true })),
    ...Object.keys(files).map((path) => ({ path, isDir: false })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}

// A save in the editor is an edit in the working tree, so Git sees it too.
export function write(absPath: string, content: string): void {
  const hit = locate(absPath);
  if (!hit) return;
  const { p, rel } = hit;
  const before = p.files[rel];
  p.files[rel] = content;
  const change = p.git.changes.find((c) => c.path === rel);
  if (change) change.modified = content;
  else if (before !== content) {
    p.git.changes.push({
      path: rel,
      status: before === undefined ? "added" : "modified",
      original: before ?? "",
      modified: content,
    });
  }
  emitEvent("git-changed", { path: p.root, files: [rel] });
}

function listing(root: unknown, rel: string) {
  const entries = dirEntries(tree(root), rel);
  const listed = new Set(entries.map((e) => e.name));
  const made = demoDirsIn(root, rel)
    .filter((name) => !listed.has(name))
    .map((name) => ({ name, isDir: true, isSymlink: false, isIgnored: false }));
  return [...made, ...entries];
}

export const fileCommands: CommandMap = {
  ...fileEditCommands,
  list_dir_entries: ({ root, rel }) => listing(root, String(rel ?? "")),
  list_dir_files: ({ root }) => allPaths(tree(root)),
  read_project_file: ({ root, rel }) => {
    const content = tree(root)[String(rel)];
    if (content === undefined) throw new Error(`${rel}: No such file`);
    const binary = isBinary(String(rel));
    return { content: binary ? "" : content, binary, tooLarge: false, size: content.length, writable: !binary };
  },
  file_exists: ({ absPath }) => {
    const hit = locate(String(absPath));
    return !!hit && hit.rel in hit.p.files;
  },
  write_file: ({ absPath, content }) => {
    write(String(absPath), String(content));
    return null;
  },
  write_file_if_unchanged: ({ absPath, expectedContent, content }) => {
    const hit = locate(String(absPath));
    const current = hit?.p.files[hit.rel] ?? "";
    if (hit && current !== expectedContent) return { written: false, currentContent: current };
    write(String(absPath), String(content));
    return { written: true };
  },
};
