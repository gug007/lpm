import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import type { LocatedPath } from "../../locate";
import { joinAbs, normalizePath, relTo } from "../../path";
import { isBinary } from "../seed/sample";
import { demoDirsIn, fileEditCommands } from "./fileEdits";
import { demoSkillFile } from "./lpmCommands";
import { projectAt, project, projects, type Project } from "./state";

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

function kindIn(files: Record<string, string>, rel: string): LocatedPath["kind"] {
  if (rel in files) return "file";
  return rel === "" || Object.keys(files).some((path) => path.startsWith(`${rel}/`)) ? "dir" : "missing";
}

function locatePath(root: string, typed: string): LocatedPath {
  const path = normalizePath(joinAbs(root, typed));
  const rel = path === root ? "" : relTo(path, root);
  if (rel !== path) return { kind: kindIn(tree(root), rel), path, rel };
  const hit = locate(path);
  const kind = folderAt(path) ? "dir" : hit && hit.rel in hit.p.files ? "file" : "missing";
  return { kind, path, rel: null };
}

// What a folder anywhere holds: one in a project, or one projects are in. null
// for any other path.
function folderAt(path: string): { name: string; isDir: boolean }[] | null {
  const p = projectAt(path);
  if (p) {
    const rel = path === p.root ? "" : relTo(path, p.root);
    return kindIn(p.files, rel) === "dir" ? listing(p.root, rel) : null;
  }
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const roots = [...projects.values()].map((project) => project.root);
  const names = new Set(roots.filter((r) => r.startsWith(prefix)).map((r) => r.slice(prefix.length).split("/")[0]));
  return names.size > 0 ? [...names].map((name) => ({ name, isDir: true })) : null;
}

export const fileCommands: CommandMap = {
  ...fileEditCommands,
  locate_path: ({ root, path }) => locatePath(String(root), String(path)),
  list_folder: ({ path }) => {
    const entries = folderAt(String(path));
    if (!entries) throw new Error(`cannot open ${path}: No such file or directory`);
    return entries;
  },
  files_exist: ({ root, paths }) =>
    (paths as string[]).map((path) => locatePath(String(root), path).kind === "file"),
  list_dir_entries: ({ root, rel }) => listing(root, String(rel ?? "")),
  list_dir_files: ({ root }) => allPaths(tree(root)),
  read_project_file: ({ root, rel }) => {
    const absPath = joinAbs(String(root), String(rel));
    const hit = locate(absPath);
    const stored = tree(root)[String(rel)] ?? hit?.p.files[hit.rel];
    const content = stored ?? demoSkillFile(absPath);
    if (content === undefined) throw new Error(`${rel}: No such file`);
    const binary = isBinary(String(rel));
    const writable = stored !== undefined && !binary;
    return { content: binary ? "" : content, binary, tooLarge: false, size: content.length, writable };
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
