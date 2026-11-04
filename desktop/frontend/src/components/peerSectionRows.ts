import { isDuplicate, type PendingDuplicate, type ProjectGroup, type ProjectInfo } from "../types";
import type { HostFolders } from "../peer/hostFolders";
import { peerRowToken } from "./peerRowOrder";
import { rollupSegments, type RollupSegment } from "./sidebarRollup";

// A paired Mac's rows, shaped the way the local list is: each project, then its
// duplicates and worktrees as a deck under it, with copies still on their way
// dealt after them as skeletons. A host that shares its folders lays them out
// as its own sidebar does, folders among the top-level rows.
export type PeerMemberRow =
  | { kind: "project"; project: ProjectInfo }
  | {
      kind: "deck";
      parent: ProjectInfo;
      children: ProjectInfo[];
      pending: PendingDuplicate[];
      collapsed: boolean;
    };

export type PeerRowItem =
  | PeerMemberRow
  | {
      kind: "folder";
      group: ProjectGroup;
      collapsed: boolean;
      /// The folder's own projects, not counting their copies.
      count: number;
      /// What a folded folder's projects are up to; empty while open.
      segments: RollupSegment[];
      /// The projects a folded folder is hiding, copies included; empty while open.
      folded: ProjectInfo[];
      rows: PeerMemberRow[];
    };

export interface PeerSectionRows {
  rows: PeerRowItem[];
  /// Sortable ids in the order the rows render; a folded deck's copies are hidden.
  ids: string[];
  /// Each parent's copies, by project name, for the row that folds them.
  decks: Map<string, ProjectInfo[]>;
}

const GROUP_PREFIX = "group:";

// `projects` is the section in the order to show it, so a deck keeps its copies
// in it.
export function peerSectionRows(
  projects: ProjectInfo[],
  pending: PendingDuplicate[],
  collapsedDecks: ReadonlySet<string>,
  folders?: HostFolders,
): PeerSectionRows {
  const byName = new Map(projects.map((p) => [p.name, p]));
  // A copy filed into a folder of its own stands there, out of its parent's deck.
  const filed = new Set(folders?.groups.flatMap((g) => g.members) ?? []);
  const decks = new Map<string, ProjectInfo[]>();
  for (const p of projects) {
    if (!isDuplicate(p, byName) || filed.has(p.name)) continue;
    const arr = decks.get(p.parentName!);
    if (arr) arr.push(p);
    else decks.set(p.parentName!, [p]);
  }

  const rows: PeerRowItem[] = [];
  const ids: string[] = [];
  const placed = new Set<string>();
  // A project's row and the deck of copies under it.
  const place = (project: ProjectInfo, shown: boolean): PeerMemberRow[] => {
    placed.add(project.name);
    if (shown) ids.push(peerRowToken(project.name));
    const children = decks.get(project.name) ?? [];
    const coming = pending.filter((copy) => copy.parent === project.name);
    if (children.length === 0 && coming.length === 0) return [{ kind: "project", project }];
    for (const child of children) placed.add(child.name);
    const collapsed = children.length > 0 && collapsedDecks.has(project.name);
    if (shown && !collapsed) ids.push(...children.map((child) => peerRowToken(child.name)));
    return [
      { kind: "project", project },
      { kind: "deck", parent: project, children, pending: coming, collapsed },
    ];
  };
  const loose = (project: ProjectInfo) =>
    !placed.has(project.name) && !filed.has(project.name) && !isDuplicate(project, byName);

  if (!folders) {
    for (const project of projects) if (loose(project)) rows.push(...place(project, true));
    return { rows, ids, decks };
  }

  const groupsById = new Map(folders.groups.map((g) => [g.id, g]));
  const shownFolders = new Set<string>();
  const showFolder = (group: ProjectGroup) => {
    shownFolders.add(group.id);
    const collapsed = !!group.collapsed;
    const members = group.members
      .map((name) => byName.get(name))
      .filter((p): p is ProjectInfo => p !== undefined && !placed.has(p.name));
    const inside = members.flatMap((member) => place(member, !collapsed));
    const folded = collapsed ? members.flatMap((m) => [m, ...(decks.get(m.name) ?? [])]) : [];
    rows.push({
      kind: "folder",
      group,
      collapsed,
      count: members.length,
      segments: collapsed ? rollupSegments(folded) : [],
      folded,
      rows: inside,
    });
  };
  for (const token of folders.order) {
    if (token.startsWith(GROUP_PREFIX)) {
      const group = groupsById.get(token.slice(GROUP_PREFIX.length));
      if (group && !shownFolders.has(group.id)) showFolder(group);
      continue;
    }
    const project = byName.get(token);
    if (project && loose(project)) rows.push(...place(project, true));
  }
  for (const group of folders.groups) if (!shownFolders.has(group.id)) showFolder(group);
  // Projects the host hasn't slotted yet go last, as they do in its own sidebar.
  for (const project of projects) if (loose(project)) rows.push(...place(project, true));
  return { rows, ids, decks };
}

// The projects the rows show, top to bottom: the axis a shift-click range is
// measured along. A folded folder's or deck's projects aren't on screen.
export function visiblePeerRowNames(rows: PeerRowItem[]): string[] {
  const shown = (row: PeerMemberRow) =>
    row.kind === "project" ? [row.project.name] : row.collapsed ? [] : row.children.map((c) => c.name);
  return rows.flatMap((row) =>
    row.kind !== "folder" ? shown(row) : row.collapsed ? [] : row.rows.flatMap(shown),
  );
}
