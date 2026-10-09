import { MAIN_LOGIN } from "./claudePoolText";
import { MAIN_POOL, poolForProject, poolForProjectKey, type ClaudePool, type PoolView } from "./store/claudePool";
import type { ProjectInfo } from "./types";

type PoolSource = { kind: "list"; owner: string } | { kind: "main" };
type Source = { kind: "pin"; id: string } | PoolSource;

type OwnKeys = Pick<ProjectInfo, "name" | "claudeAccount" | "claudeAccounts">;

function ownSource(project: OwnKeys): Source | null {
  if (project.claudeAccount !== undefined) return { kind: "pin", id: project.claudeAccount };
  if (project.claudeAccounts === undefined) return null;
  return project.claudeAccounts.length > 0 ? { kind: "list", owner: project.name } : { kind: "main" };
}

// Mirrors claude_choice.rs: a copy with no keys of its own follows its parent's.
function sourceOf(project: ProjectInfo, projects: ProjectInfo[]): Source {
  const parent = project.parentName ? projects.find((p) => p.name === project.parentName) : undefined;
  return ownSource(project) ?? (parent && ownSource(parent)) ?? { kind: "main" };
}

// A list with no known accounts has no pool of its own and falls back to the
// main accounts.
function viewOf(source: PoolSource, pool: ClaudePool | null): PoolView | undefined {
  const main = poolForProjectKey(pool, MAIN_POOL);
  return source.kind === "list" ? (poolForProject(pool, source.owner) ?? main) : main;
}

/** Whether the project, or the parent a copy follows, is pinned to one account. */
export function projectPinned(project: ProjectInfo, projects: ProjectInfo[]): boolean {
  return sourceOf(project, projects).kind === "pin";
}

/** The pool a project's new Claude sessions pick from, or undefined when it is
 *  pinned to one account. */
export function projectPool(
  project: ProjectInfo,
  projects: ProjectInfo[],
  pool: ClaudePool | null,
): PoolView | undefined {
  const source = sourceOf(project, projects);
  return source.kind === "pin" ? undefined : viewOf(source, pool);
}

/** The account a project's new Claude sessions use, as its limits key, or null
 *  when that is the login lpm itself was started with, which only the backend
 *  knows. Mirrors account_for_project in claude_pool.rs. */
export function projectAccount(
  project: ProjectInfo,
  projects: ProjectInfo[],
  pool: ClaudePool | null,
  registered: string[],
): string | null {
  const source = sourceOf(project, projects);
  if (source.kind === "pin") return registered.includes(source.id) ? source.id : MAIN_LOGIN;
  return viewOf(source, pool)?.current ?? null;
}
