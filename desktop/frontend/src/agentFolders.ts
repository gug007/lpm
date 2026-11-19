import { peerSlugOf } from "./peer/markers";
import { findAICLI } from "./slashCommands";
import { useAppStore } from "./store/app";
import { shellQuote } from "./terminal-io";
import type { AICLI, ProjectInfo } from "./types";

// A path as the shell should pass it on. A shell leaves a `~` after `=` as
// it is, so a home-relative root goes through $HOME instead.
function shellPath(path: string): string {
  if (path === "~") return `"$HOME"`;
  if (path.startsWith("~/")) return `"$HOME"/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}

// Each CLI's flag for one more folder it may read and change, written in its
// `=` form so a prompt after it is never taken for another folder.
const FOLDER_FLAG: Partial<Record<AICLI, (path: string) => string>> = {
  claude: (path) => `--add-dir=${shellPath(path)}`,
  codex: (path) => `--add-dir=${shellPath(path)}`,
  gemini: (path) => `--include-directories=${shellPath(path)}`,
};

export const FOLDER_AGENTS = "Claude Code, Codex and Gemini";

export function takesFolders(agent: string): boolean {
  return agent in FOLDER_FLAG;
}

// The projects whose folders a project's agents may also work in: this
// computer's own, not archived, and not the project itself.
export function folderChoices(projects: readonly ProjectInfo[], projectName: string): ProjectInfo[] {
  if (peerSlugOf(projectName)) return [];
  return projects.filter(
    (p) => p.name !== projectName && !p.isRemote && !p.archived && !peerSlugOf(p.name) && p.root,
  );
}

// `cmd` with the agent it starts given `roots` as folders of its own, right
// after the CLI's name; any other command comes back unchanged.
export function withAgentFolders(cmd: string, roots: readonly string[]): string {
  const found = findAICLI(cmd);
  const flag = found && FOLDER_FLAG[found.cli];
  if (!found || !flag || roots.length === 0) return cmd;
  const rest = cmd.slice(found.end);
  const added = roots.map(flag).filter((arg) => !rest.includes(arg));
  return added.length ? `${cmd.slice(0, found.end)} ${added.join(" ")}${rest}` : cmd;
}

const KEY = "lpm:agentFolders:v1";

// Per project, the other projects (by name) its agents also work in, kept on
// this computer.
export function loadAgentFolders(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAgentFolders(projectName: string, names: string[]): void {
  const all = loadAgentFolders();
  if (names.length) all[projectName] = names;
  else delete all[projectName];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a convenience only */
  }
}

// The folders a project's agents start with, as paths: the picked projects
// that are still here.
export function agentFolderRoots(projectName: string): string[] {
  const names = loadAgentFolders()[projectName] ?? [];
  if (names.length === 0) return [];
  const choices = folderChoices(useAppStore.getState().projects, projectName);
  return names.flatMap((name) => choices.find((p) => p.name === name)?.root ?? []);
}
