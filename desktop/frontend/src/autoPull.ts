import type { OriginStatus } from "./originStatus";
import { isPeerRoot } from "./peer/markers";
import type { ProjectInfo } from "./types";

// Settings › Git › Auto pull: nothing, only projects set to On, or every
// project that isn't set to Off.
export const AUTO_PULL_MODES = ["off", "chosen", "all"] as const;
export type AutoPullMode = (typeof AUTO_PULL_MODES)[number];

export function normalizeAutoPullMode(raw: unknown): AutoPullMode {
  return raw === "chosen" || raw === "all" ? raw : "off";
}

type AutoPullProject = Pick<ProjectInfo, "name" | "parentName" | "autoPull">;

// Where a project's auto pull comes from: Settings has it off for everything,
// the project's own choice, its parent's (for a copy), or the Settings default.
export type AutoPullSource = "settings" | "project" | "parent" | "default";

export interface AutoPullState {
  on: boolean;
  source: AutoPullSource;
}

export function autoPullState(
  project: AutoPullProject,
  projects: AutoPullProject[],
  mode: AutoPullMode,
): AutoPullState {
  if (mode === "off") return { on: false, source: "settings" };
  if (project.autoPull !== undefined) return { on: project.autoPull, source: "project" };
  const parent = project.parentName ? projects.find((p) => p.name === project.parentName) : undefined;
  if (parent?.autoPull !== undefined) return { on: parent.autoPull, source: "parent" };
  return { on: mode === "all", source: "default" };
}

// What following resolves to, as the first choice of the per-project menu:
// "Default (On)", or "Same as web (Off)" on a copy.
export function followLabel(
  project: AutoPullProject,
  projects: AutoPullProject[],
  mode: AutoPullMode,
  parentLabel?: string,
): string {
  const follow = autoPullState({ ...project, autoPull: undefined }, projects, mode);
  const state = follow.on ? "On" : "Off";
  return project.parentName && parentLabel ? `Same as ${parentLabel} (${state})` : `Default (${state})`;
}

// The project auto pull would act on at `root`: one of this Mac's own, not a
// paired Mac's or an SSH host's, and one whose config loads.
export function autoPullTarget(projects: ProjectInfo[], root: string): ProjectInfo | undefined {
  if (isPeerRoot(root)) return undefined;
  return projects.find((p) => p.root === root && !p.isRemote && !p.configError);
}

// Only a plain fast-forward is ever automatic: a branch that tracks origin, is
// behind it, has nothing of its own to push, no uncommitted changes and no
// conflict. The Mac checks all of this again right before it pulls.
export function wantsAutoPull(status: OriginStatus): boolean {
  return (
    !!status.branch &&
    status.hasUpstream &&
    status.behind > 0 &&
    status.ahead === 0 &&
    !status.conflicted &&
    status.changes === 0
  );
}

// The projects whose own choice differs from what the mode gives them, for the
// line under the Settings row.
export function autoPullExceptions(
  projects: AutoPullProject[],
  mode: AutoPullMode,
): { on: string[]; off: string[] } {
  const on: string[] = [];
  const off: string[] = [];
  if (mode === "off") return { on, off };
  for (const project of projects) {
    if (project.autoPull === undefined) continue;
    const parent = project.parentName ? projects.find((p) => p.name === project.parentName) : undefined;
    const inherited = parent?.autoPull ?? mode === "all";
    if (project.autoPull === inherited) continue;
    (project.autoPull ? on : off).push(project.name);
  }
  return { on, off };
}

export function commitsText(count: number): string {
  return `${count} commit${count === 1 ? "" : "s"}`;
}
