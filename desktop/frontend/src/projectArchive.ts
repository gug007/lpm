// Archived projects: out of the sidebar with their setup kept, listed on the
// Archive page. Each machine keeps its own; a paired machine's come back with
// their names peer-marked so every later call about them reaches that machine.
import {
  ArchivePreview,
  ListArchivedProjects,
  ProjectDiskSize,
} from "../bridge/commands";
import { prefixName, stripMarker } from "./peer/markers";
import type { NavItemId } from "./sidebarNav";

export interface ArchivedProject {
  // Routable: peer-marked for a paired machine's project.
  name: string;
  label: string;
  root: string;
  isRemote: boolean;
  // When it was archived, in ms.
  archivedAt: number;
  copies: number;
  automations: number;
  // "" for this machine, else the paired machine's slug.
  machine: string;
}

export interface ArchivePreviewInfo {
  running: boolean;
  copies: number;
  automations: number;
}

export type ArchiveSort = "archived" | "name" | "size";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function toArchived(raw: unknown, machine: string): ArchivedProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) return null;
  const label = typeof r.label === "string" && r.label.trim() ? r.label : r.name;
  return {
    name: machine ? prefixName(machine, r.name) : r.name,
    label,
    root: typeof r.root === "string" ? r.root : "",
    isRemote: r.isRemote === true,
    archivedAt: num(r.archivedAt),
    copies: num(r.copies),
    automations: num(r.automations),
    machine,
  };
}

/** The archived projects of this machine (`slug` empty) or a paired one. */
export async function listArchived(slug = ""): Promise<ArchivedProject[]> {
  const raw: unknown = await ListArchivedProjects(slug ? prefixName(slug, "") : "");
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => toArchived(r, slug)).filter((p): p is ArchivedProject => p !== null);
}

export async function archivePreview(name: string): Promise<ArchivePreviewInfo> {
  const raw = (await ArchivePreview(name)) as Partial<ArchivePreviewInfo> | null;
  return { running: raw?.running === true, copies: num(raw?.copies), automations: num(raw?.automations) };
}

/** The folder's size in bytes, or null when it can't be measured here. */
export async function projectDiskSize(name: string): Promise<number | null> {
  const bytes: unknown = await ProjectDiskSize(name);
  return typeof bytes === "number" && Number.isFinite(bytes) ? bytes : null;
}

/** Where the Archive page is reached from, as the confirmation names it. */
export function archiveLocation(inSidebar: readonly NavItemId[]): string {
  return inSidebar.includes("archive") ? "Archive in the sidebar" : "More › Archive";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "duplicate", "worktree" or "copy" are all a project's copies to the user. */
export function copiesWord(n: number): string {
  return plural(n, "duplicate or worktree", "duplicates and worktrees");
}

export function matchesArchived(p: ArchivedProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.label, p.name, stripMarker(p.root)].some((s) => s.toLowerCase().includes(q));
}

/** Newest first, by name, or biggest first; unknown sizes go last. */
export function sortArchived(
  list: readonly ArchivedProject[],
  sort: ArchiveSort,
  sizes: ReadonlyMap<string, number | null>,
): ArchivedProject[] {
  const byName = (a: ArchivedProject, b: ArchivedProject) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  const out = [...list];
  if (sort === "name") return out.sort(byName);
  if (sort === "size") {
    const size = (p: ArchivedProject) => sizes.get(p.name) ?? -1;
    return out.sort((a, b) => size(b) - size(a) || byName(a, b));
  }
  return out.sort((a, b) => b.archivedAt - a.archivedAt || byName(a, b));
}

/** "6 projects · 2 automations paused". */
export function archiveSummary(list: readonly ArchivedProject[]): string {
  if (list.length === 0) return "Projects you archive wait here, with their setup kept.";
  const paused = list.reduce((n, p) => n + p.automations, 0);
  const parts = [plural(list.length, "project")];
  if (paused > 0) parts.push(`${plural(paused, "automation")} paused`);
  return parts.join(" · ");
}
