import type { CommandMap } from "../backend";
import type { SeedChange } from "../seed/types";
import { emitEvent } from "../ipc";
import { projectAt, record, type Project } from "./state";

const now = () => Date.now();

function repo(cwd: unknown): Project | undefined {
  return projectAt(String(cwd));
}

function lineCounts(c: SeedChange) {
  const before = c.original ? c.original.split("\n") : [];
  const after = c.modified ? c.modified.split("\n") : [];
  const had = new Set(before);
  const has = new Set(after);
  return { added: after.filter((l) => !had.has(l)).length, removed: before.filter((l) => !has.has(l)).length };
}

function diff(c: SeedChange | undefined) {
  return { original: c?.original ?? "", modified: c?.modified ?? "", binary: false, tooLarge: false };
}

function gitChanged(p: Project): void {
  emitEvent("git-changed", { path: p.root, files: null });
}

const commitMessage = (p: Project) => {
  const files = p.git.changes.map((c) => c.path.split("/").pop()).join(", ");
  return `Update ${files}\n\nTouches ${p.git.changes.length} file${p.git.changes.length === 1 ? "" : "s"} on ${p.git.branch}.`;
};

export const gitCommands: CommandMap = {
  git_status: ({ cwd }) => {
    const p = repo(cwd);
    return {
      branch: p?.git.branch ?? "main",
      detached: false,
      uncommitted: p?.git.changes.length ?? 0,
      isGitRepo: !!p,
      hasUpstream: p?.git.upstream ?? false,
      ahead: p?.git.ahead ?? 0,
      behind: p?.git.behind ?? 0,
      hasRemote: true,
    };
  },
  git_origin_status: ({ cwd }) => {
    const p = repo(cwd);
    return {
      branch: p?.git.branch ?? "main",
      hasUpstream: p?.git.upstream ?? false,
      ahead: p?.git.ahead ?? 0,
      behind: p?.git.behind ?? 0,
      base: "",
      baseBehind: 0,
      conflicted: false,
      changes: p?.git.changes.length ?? 0,
      fetched: true,
    };
  },
  git_default_branch: () => "main",
  git_merge_state: () => ({ merging: false, source: "", files: [] }),
  list_branches: ({ cwd }) => {
    const branches = repo(cwd)?.git.branches ?? [];
    const local = new Set(branches.filter((b) => !b.remote).map((b) => b.name));
    return branches
      .map((b) => ({ ...b, name: b.remote ? b.name.replace(`${b.remote}/`, "") : b.name }))
      .filter((b) => !b.remote || !local.has(b.name))
      .map((b) => ({
        name: b.name,
        committerDate: Math.floor((now() - b.ageMs) / 1000),
        ...(b.remote ? { remote: b.remote } : {}),
      }));
  },
  checkout_branch: ({ cwd, branch }) => {
    const p = repo(cwd);
    if (!p) return null;
    const name = String(branch).replace(/^origin\//, "");
    p.git.branch = name;
    if (!p.git.branches.some((b) => b.name === name && !b.remote)) {
      p.git.branches.unshift({ name, ageMs: 60_000 });
    }
    p.git.ahead = 0;
    p.git.behind = 0;
    gitChanged(p);
    return null;
  },
  git_changed_files: ({ cwd }) =>
    (repo(cwd)?.git.changes ?? []).map((c) => ({ path: c.path, status: c.status, staged: false })),
  git_diff_stat: ({ cwd }) => {
    const changes = repo(cwd)?.git.changes ?? [];
    const counts = changes.map(lineCounts);
    return {
      files: changes.length,
      linesAdded: counts.reduce((n, c) => n + c.added, 0),
      linesRemoved: counts.reduce((n, c) => n + c.removed, 0),
    };
  },
  git_file_line_counts: ({ cwd }) =>
    (repo(cwd)?.git.changes ?? []).map((c) => ({ path: c.path, ...lineCounts(c) })),
  git_file_diff: ({ cwd, path }) => diff(repo(cwd)?.git.changes.find((c) => c.path === path)),
  git_file_diffs: ({ cwd, files }) => {
    const p = repo(cwd);
    if (p) record("review", p.name, "changes");
    return Object.fromEntries(
      ((files as { path: string }[]) ?? []).map((f) => [f.path, diff(p?.git.changes.find((c) => c.path === f.path))]),
    );
  },
  generate_commit_message: ({ cwd }) => {
    const p = repo(cwd);
    return p ? commitMessage(p) : "Update files";
  },
  generate_commit_split: ({ cwd, files }) => {
    const p = repo(cwd);
    const byFolder = new Map<string, string[]>();
    for (const file of (files as string[] | undefined) ?? []) {
      const folder = file.includes("/") ? file.split("/")[0] : "";
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
    }
    const groups = [...byFolder.entries()];
    if (groups.length > 5) groups[4] = [groups[4][0], groups.slice(4).flatMap(([, paths]) => paths)];
    return groups.slice(0, 5).map(([folder, paths], i) => ({
      message: i === 0 && p ? commitMessage(p) : `chore(${folder || "repo"}): update ${paths.length} file${paths.length === 1 ? "" : "s"}`,
      files: paths,
    }));
  },
  git_commit: ({ cwd, files }) => {
    const p = repo(cwd);
    if (!p) return null;
    const picked = new Set((files as string[] | undefined) ?? p.git.changes.map((c) => c.path));
    p.git.changes = p.git.changes.filter((c) => !picked.has(c.path));
    p.git.ahead += 1;
    gitChanged(p);
    return null;
  },
  git_push: ({ cwd }) => {
    const p = repo(cwd);
    if (p) {
      p.git.ahead = 0;
      p.git.upstream = true;
      gitChanged(p);
    }
    return null;
  },
};
