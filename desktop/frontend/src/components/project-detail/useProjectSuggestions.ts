import { useEffect, useState } from "react";
import { FileExists, ReadFile } from "../../../bridge/commands";
import {
  buildSuggestions,
  parseJustfileRecipes,
  parseMakefileTargets,
  parsePackageJsonScripts,
  type ActionTemplate,
} from "./projectSuggestions";

function joinPath(root: string, name: string): string {
  return `${root.replace(/\/+$/, "")}/${name}`;
}

async function tryRead(path: string): Promise<string | null> {
  try {
    const content = await ReadFile(path);
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

async function readFirst(root: string, names: string[]): Promise<string | null> {
  for (const name of names) {
    const content = await tryRead(joinPath(root, name));
    if (content !== null) return content;
  }
  return null;
}

async function tryExists(path: string): Promise<boolean> {
  try {
    return (await FileExists(path)) === true;
  } catch {
    return false;
  }
}

async function anyExists(root: string, names: string[]): Promise<boolean> {
  const results = await Promise.all(
    names.map((name) => tryExists(joinPath(root, name))),
  );
  return results.some(Boolean);
}

export async function loadProjectSuggestions(
  root: string,
): Promise<ActionTemplate[]> {
  const [pkg, makefile, justfile] = await Promise.all([
    readFirst(root, ["package.json"]),
    readFirst(root, ["Makefile", "makefile"]),
    readFirst(root, ["justfile", "Justfile", ".justfile"]),
  ]);
  const [bun, pnpm, yarn, npm, hasCompose] = await Promise.all([
    anyExists(root, ["bun.lockb", "bun.lock"]),
    tryExists(joinPath(root, "pnpm-lock.yaml")),
    tryExists(joinPath(root, "yarn.lock")),
    tryExists(joinPath(root, "package-lock.json")),
    anyExists(root, [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ]),
  ]);
  return buildSuggestions({
    scripts: pkg ? parsePackageJsonScripts(pkg) : [],
    makeTargets: makefile ? parseMakefileTargets(makefile) : [],
    justRecipes: justfile ? parseJustfileRecipes(justfile) : [],
    hasCompose,
    locks: { bun, pnpm, yarn, npm },
  });
}

// Scans the project directory for runnable commands once per open. Skips edit
// mode, remote/SSH projects, and rootless mounts, clearing prior results so a
// reopened wizard never shows a stale project's scripts.
export function useProjectSuggestions(params: {
  open: boolean;
  editing: boolean;
  isRemote: boolean;
  projectRoot?: string;
}): ActionTemplate[] {
  const { open, editing, isRemote, projectRoot } = params;
  const [suggestions, setSuggestions] = useState<ActionTemplate[]>([]);

  useEffect(() => {
    if (!open || editing || isRemote || !projectRoot) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    void loadProjectSuggestions(projectRoot).then((result) => {
      if (!cancelled) setSuggestions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, editing, isRemote, projectRoot]);

  return suggestions;
}
