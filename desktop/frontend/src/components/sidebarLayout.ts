import type { ProjectGroup } from "../types";
import { arrayEq } from "./actionsDndLayout";

// Pure model + move math for the sidebar's interleaved folders/projects list.
// Analogous to actionsDndLayout.ts. A SidebarLayout is the full top-level
// order plus the folder definitions:
//   - `order` holds top-level tokens: a loose project name, or a "group:<id>".
//   - each group's `members` holds its project names in within-folder order.
// A loose `order` slot is always a top-level (non-duplicate) project; a
// duplicate never sits loose, but it may be an explicit folder member —
// promoted out of its parent's nesting and onto the folder's level.
export interface SidebarLayout {
  order: string[];
  groups: ProjectGroup[];
}

const GROUP_PREFIX = "group:";
const FOLDER_NEST_PREFIX = "folder-nest:";
const FOLDER_BODY_PREFIX = "folder-body:";

export function groupToken(id: string): string {
  return `${GROUP_PREFIX}${id}`;
}

export function groupIdOf(token: string): string | null {
  return token.startsWith(GROUP_PREFIX) ? token.slice(GROUP_PREFIX.length) : null;
}

// Droppable id for a folder header — dropping a project here moves it into the
// folder. Mirrors actionsDndLayout's nestId.
export function folderNestId(id: string): string {
  return `${FOLDER_NEST_PREFIX}${id}`;
}

// Droppable id for an expanded folder's body (covers empty folders too).
export function folderBodyId(id: string): string {
  return `${FOLDER_BODY_PREFIX}${id}`;
}

// Resolve either folder drop id form back to its group id.
export function dropFolderTarget(id: string): string | null {
  if (id.startsWith(FOLDER_NEST_PREFIX)) return id.slice(FOLDER_NEST_PREFIX.length);
  if (id.startsWith(FOLDER_BODY_PREFIX)) return id.slice(FOLDER_BODY_PREFIX.length);
  return null;
}

function clamp(i: number, min: number, max: number): number {
  return Math.max(min, Math.min(i, max));
}

export function groupById(groups: ProjectGroup[], id: string): ProjectGroup | undefined {
  return groups.find((g) => g.id === id);
}

// project name -> the id of the group it belongs to (if any).
export function membershipMap(groups: ProjectGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const name of g.members) m.set(name, g.id);
  return m;
}

// Remove a project name from wherever it currently sits (a loose token in
// `order`, or a member of some group).
function detach(layout: SidebarLayout, name: string): SidebarLayout {
  return {
    order: layout.order.filter((t) => t !== name),
    groups: layout.groups.map((g) =>
      g.members.includes(name)
        ? { ...g, members: g.members.filter((m) => m !== name) }
        : g,
    ),
  };
}

// Move a top-level token (loose project name or "group:<id>") to a new slot.
export function moveTopLevel(layout: SidebarLayout, token: string, toIndex: number): SidebarLayout {
  const order = layout.order.filter((t) => t !== token);
  order.splice(clamp(toIndex, 0, order.length), 0, token);
  return { order, groups: layout.groups };
}

// Move a project into a folder at an optional position (default: end).
export function moveIntoGroup(
  layout: SidebarLayout,
  name: string,
  groupId: string,
  toIndex?: number,
): SidebarLayout {
  const base = detach(layout, name);
  const groups = base.groups.map((g) => {
    if (g.id !== groupId) return g;
    const members = g.members.slice();
    const idx = toIndex == null ? members.length : clamp(toIndex, 0, members.length);
    members.splice(idx, 0, name);
    return { ...g, members };
  });
  return { order: base.order, groups };
}

// Move a project out of its folder and back into the top-level order.
export function moveOutOfGroup(
  layout: SidebarLayout,
  name: string,
  toOrderIndex: number,
): SidebarLayout {
  const base = detach(layout, name);
  const order = base.order.slice();
  order.splice(clamp(toOrderIndex, 0, order.length), 0, name);
  return { order, groups: base.groups };
}

// Reorder a member within its folder.
export function reorderWithinGroup(
  layout: SidebarLayout,
  groupId: string,
  name: string,
  toIndex: number,
): SidebarLayout {
  const groups = layout.groups.map((g) => {
    if (g.id !== groupId) return g;
    const members = g.members.filter((m) => m !== name);
    members.splice(clamp(toIndex, 0, members.length), 0, name);
    return { ...g, members };
  });
  return { order: layout.order, groups };
}

// Add a new folder, inserting its token at `atIndex` (default: end).
export function addGroup(
  layout: SidebarLayout,
  group: ProjectGroup,
  atIndex?: number,
): SidebarLayout {
  const order = layout.order.slice();
  const idx = atIndex == null ? order.length : clamp(atIndex, 0, order.length);
  order.splice(idx, 0, groupToken(group.id));
  return { order, groups: [...layout.groups, group] };
}

// Delete a folder: its members spill back into the top-level order at the
// folder's former position, then the folder is dropped.
export function removeGroup(layout: SidebarLayout, groupId: string): SidebarLayout {
  const g = groupById(layout.groups, groupId);
  if (!g) return layout;
  const tok = groupToken(groupId);
  const pos = layout.order.indexOf(tok);
  const order = layout.order.slice();
  if (pos >= 0) order.splice(pos, 1, ...g.members);
  else order.push(...g.members);
  return { order, groups: layout.groups.filter((x) => x.id !== groupId) };
}

export function renameGroup(layout: SidebarLayout, groupId: string, name: string): SidebarLayout {
  return {
    order: layout.order,
    groups: layout.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
  };
}

export function setGroupCollapsed(
  layout: SidebarLayout,
  groupId: string,
  collapsed: boolean,
): SidebarLayout {
  return {
    order: layout.order,
    groups: layout.groups.map((g) =>
      g.id === groupId ? { ...g, collapsed: collapsed || undefined } : g,
    ),
  };
}

// The flat all-projects order written to settings.projectOrder for the backend.
// Walk top-level order, expanding each folder into its members. A folder member
// may be a duplicate; the backend re-groups every duplicate after its parent on
// its own, so a duplicate's position here is only advisory.
export function flattenForProjectOrder(layout: SidebarLayout): string[] {
  const byId = new Map(layout.groups.map((g) => [g.id, g]));
  const out: string[] = [];
  for (const token of layout.order) {
    const gid = groupIdOf(token);
    if (gid) {
      const g = byId.get(gid);
      if (g) out.push(...g.members);
    } else {
      out.push(token);
    }
  }
  return out;
}

// Self-healing pass run after a project-list refresh. `topLevelNames` are the
// names eligible to sit loose at the top level (non-duplicate projects);
// `memberNames` are every existing project name, since a folder may also hold a
// duplicate that was explicitly placed in it. Drops stale members/tokens,
// dedupes (a name claimed by a folder can't also be loose), guarantees every
// folder has a token, and appends brand-new top-level projects as loose at the
// end. Idempotent.
export function reconcile(
  layout: SidebarLayout,
  topLevelNames: string[],
  memberNames: string[] = topLevelNames,
): SidebarLayout {
  const looseNames = new Set(topLevelNames);
  const memberable = new Set(memberNames);
  const claimed = new Set<string>();
  const groups = layout.groups.map((g) => {
    const members = g.members.filter((m) => memberable.has(m) && !claimed.has(m));
    members.forEach((m) => claimed.add(m));
    return { ...g, members };
  });
  const groupIds = new Set(groups.map((g) => g.id));

  const seen = new Set<string>();
  const order: string[] = [];
  for (const token of layout.order) {
    const gid = groupIdOf(token);
    if (gid) {
      if (groupIds.has(gid) && !seen.has(token)) {
        order.push(token);
        seen.add(token);
      }
    } else if (looseNames.has(token) && !claimed.has(token) && !seen.has(token)) {
      order.push(token);
      seen.add(token);
    }
  }
  for (const g of groups) {
    const tok = groupToken(g.id);
    if (!seen.has(tok)) {
      order.push(tok);
      seen.add(tok);
    }
  }
  for (const name of topLevelNames) {
    if (!claimed.has(name) && !seen.has(name)) {
      order.push(name);
      seen.add(name);
    }
  }
  return { order, groups };
}

// What a sortable id represents in the current layout.
export type SidebarNode =
  | { kind: "group"; id: string }
  | { kind: "loose"; name: string }
  | { kind: "member"; name: string; groupId: string };

export function classify(layout: SidebarLayout, id: string): SidebarNode | null {
  const gid = groupIdOf(id);
  if (gid) return groupById(layout.groups, gid) ? { kind: "group", id: gid } : null;
  const owner = layout.groups.find((g) => g.members.includes(id));
  if (owner) return { kind: "member", name: id, groupId: owner.id };
  if (layout.order.includes(id)) return { kind: "loose", name: id };
  return null;
}

// Translate a drag (active id) dropped on a target (over id) into the next
// layout, or null for a no-op / disallowed move. `overId` may be a sortable
// row id (loose name, "group:<id>", or a member name) or a folder drop-zone id
// (folderNestId / folderBodyId). Folders never nest into folders.
export function resolveSidebarDrop(
  layout: SidebarLayout,
  activeId: string,
  overId: string,
): SidebarLayout | null {
  if (activeId === overId) return null;
  const a = classify(layout, activeId);
  if (!a) return null;

  const folderTarget = dropFolderTarget(overId);
  if (folderTarget !== null) {
    if (a.kind === "group") return null;
    if (a.kind === "member" && a.groupId === folderTarget) return null;
    return moveIntoGroup(layout, a.name, folderTarget);
  }

  const o = classify(layout, overId);
  if (!o) return null;

  if (a.kind === "group") {
    if (o.kind === "member") return null;
    return moveTopLevel(layout, activeId, layout.order.indexOf(overId));
  }

  if (o.kind === "member") {
    const g = groupById(layout.groups, o.groupId);
    if (!g) return null;
    const overIdx = g.members.indexOf(o.name);
    if (a.kind === "member" && a.groupId === o.groupId) {
      return reorderWithinGroup(layout, o.groupId, a.name, overIdx);
    }
    return moveIntoGroup(layout, a.name, o.groupId, overIdx);
  }

  // over is top-level (loose project or folder token).
  const toIndex = layout.order.indexOf(overId);
  if (a.kind === "member") return moveOutOfGroup(layout, a.name, toIndex);
  return moveTopLevel(layout, activeId, toIndex);
}

// True when the two layouts are structurally identical (used to skip no-op
// persists). Cheap deep-equal over the known shape.
export function layoutsEqual(a: SidebarLayout, b: SidebarLayout): boolean {
  if (!arrayEq(a.order, b.order)) return false;
  if (a.groups.length !== b.groups.length) return false;
  return a.groups.every((ga, i) => {
    const gb = b.groups[i];
    return (
      ga.id === gb.id &&
      ga.name === gb.name &&
      !!ga.collapsed === !!gb.collapsed &&
      arrayEq(ga.members, gb.members)
    );
  });
}
