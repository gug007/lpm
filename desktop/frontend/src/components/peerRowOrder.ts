import type { ProjectInfo } from "../types";

// Row order inside a paired host's sidebar section.
//
// A host lists its own projects in its own order, and nothing this Mac writes to
// its own sidebar layout can change that: peer projects are deliberately kept
// out of sidebarOrder and folders (they belong to the Mac that hosts them). So
// the order lives here instead, as a preference of the Mac doing the looking —
// peer slug -> that section's project names, top to bottom.
//
// The map is advisory: a name the host no longer lists is ignored, and one it
// lists that the map has never seen sorts to the end, so a project created over
// there still appears without the order having to be rewritten first.
export type PeerRowOrder = Record<string, string[]>;

const ROW_PREFIX = "peerrow:";

// Sortable id for a host's row. Distinct from the section's own "peer:<slug>"
// token: that one is a slot in the sidebar order, this one never enters it.
export function peerRowToken(name: string): string {
  return `${ROW_PREFIX}${name}`;
}

// The peer project name behind a row id, or null for any other sortable id.
export function peerRowNameOf(id: string): string | null {
  return id.startsWith(ROW_PREFIX) ? id.slice(ROW_PREFIX.length) : null;
}

export function isPeerRowId(id: string): boolean {
  return id.startsWith(ROW_PREFIX);
}

// Apply a section's stored order to the rows the host actually listed. Unknown
// names keep their host-given order at the end.
export function orderPeerProjects(
  projects: ProjectInfo[],
  order: string[] | undefined,
): ProjectInfo[] {
  if (!order || order.length === 0) return projects;
  const rank = new Map(order.map((name, i) => [name, i]));
  const last = order.length;
  const ranked = projects.map((project) => ({ project, rank: rank.get(project.name) ?? last }));
  // Array.prototype.sort is stable, so equal ranks keep the host's order.
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((entry) => entry.project);
}

// Move `active` to where `over` sits in the currently rendered row order.
// Returns null for a no-op or a name that isn't on screen.
export function movePeerRow(names: string[], active: string, over: string): string[] | null {
  const from = names.indexOf(active);
  const to = names.indexOf(over);
  if (from < 0 || to < 0 || from === to) return null;
  const next = names.slice();
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}

// Drop the sections of Macs that are no longer paired, so unpairing doesn't
// leave their order behind forever. Run on write: a slug is only dropped when
// the pairing list that omits it is the live one.
export function prunePeerRowOrder(order: PeerRowOrder, slugs: Iterable<string>): PeerRowOrder {
  const live = new Set(slugs);
  const out: PeerRowOrder = {};
  for (const [slug, names] of Object.entries(order)) {
    if (live.has(slug)) out[slug] = names;
  }
  return out;
}
