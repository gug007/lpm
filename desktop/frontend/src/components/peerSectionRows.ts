import { isDuplicate, type PendingDuplicate, type ProjectInfo } from "../types";
import { peerRowToken } from "./peerRowOrder";

// A paired Mac's rows, shaped the way the local list is: each project, then its
// duplicates and worktrees as a deck under it, with copies still on their way
// dealt after them as skeletons.
export type PeerRowItem =
  | { kind: "project"; project: ProjectInfo }
  | {
      kind: "deck";
      parent: ProjectInfo;
      children: ProjectInfo[];
      pending: PendingDuplicate[];
      collapsed: boolean;
    };

export interface PeerSectionRows {
  rows: PeerRowItem[];
  /// Sortable ids in the order the rows render; a folded deck's copies are hidden.
  ids: string[];
  /// Each parent's copies, by project name, for the row that folds them.
  decks: Map<string, ProjectInfo[]>;
}

// `projects` is the section in the user's order, so a deck keeps its copies in it.
export function peerSectionRows(
  projects: ProjectInfo[],
  pending: PendingDuplicate[],
  collapsedDecks: ReadonlySet<string>,
): PeerSectionRows {
  const byName = new Map(projects.map((p) => [p.name, p]));
  const decks = new Map<string, ProjectInfo[]>();
  for (const p of projects) {
    if (!isDuplicate(p, byName)) continue;
    const arr = decks.get(p.parentName!);
    if (arr) arr.push(p);
    else decks.set(p.parentName!, [p]);
  }

  const rows: PeerRowItem[] = [];
  const ids: string[] = [];
  for (const project of projects) {
    if (isDuplicate(project, byName)) continue;
    rows.push({ kind: "project", project });
    ids.push(peerRowToken(project.name));
    const children = decks.get(project.name) ?? [];
    const coming = pending.filter((copy) => copy.parent === project.name);
    if (children.length === 0 && coming.length === 0) continue;
    const collapsed = children.length > 0 && collapsedDecks.has(project.name);
    rows.push({ kind: "deck", parent: project, children, pending: coming, collapsed });
    if (!collapsed) ids.push(...children.map((child) => peerRowToken(child.name)));
  }
  return { rows, ids, decks };
}
