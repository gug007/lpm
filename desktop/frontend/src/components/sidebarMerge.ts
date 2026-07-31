import type { ProjectGroup } from "../types";
import { groupIdOf, groupToken, type SidebarLayout } from "./sidebarLayout";

// Every sidebar save is a full overwrite of groups.json + settings.sidebarOrder
// from memory, and several lpm instances share one ~/.lpm (a dev build next to
// the app, a duplicate of the repo, the phone writing through remote.rs). The
// `sidebar-changed` watcher re-hydrates us after someone else's write, but it
// lands ~500ms later — a save inside that window used to blindly clobber their
// folders, and an instance whose layout predated a folder wiped it wholesale.
//
// So a save is a three-way merge, not an overwrite. `base` is the layout we
// started this change from — our copy of what disk held — which is what makes
// "we deleted this folder" distinguishable from "someone else added it":
//
//   - a project whose placement we changed (base -> ours) keeps our placement;
//   - a project we merely inherited unchanged takes disk's placement, since
//     disk is the newer information;
//   - a folder we created or deleted stays created/deleted; a folder that is
//     on disk and was never in `base` is adopted with its members.
//
// `known` is the current project-name set. A disk name that no longer names a
// project is never adopted, and a name only we hold (see `reconcile`, which
// keeps names it can't resolve) stays put rather than being re-placed by disk.

// Where a project sits: a folder id, or null for a loose top-level slot.
// `undefined` (absent from the map) means the layout doesn't place it at all.
type Placement = string | null;

function placements(layout: SidebarLayout): Map<string, Placement> {
  const m = new Map<string, Placement>();
  for (const token of layout.order) if (groupIdOf(token) === null) m.set(token, null);
  for (const g of layout.groups) for (const name of g.members) m.set(name, g.id);
  return m;
}

export function mergeWithDisk(
  ours: SidebarLayout,
  base: SidebarLayout,
  disk: SidebarLayout,
  known: Set<string>,
): SidebarLayout {
  const ourP = placements(ours);
  const baseP = placements(base);
  const diskP = placements(disk);

  const ourIds = new Set(ours.groups.map((g) => g.id));
  const baseIds = new Set(base.groups.map((g) => g.id));
  // On disk, never in base: created by someone else while we held this copy.
  // (In base but not ours = we deleted it, so it stays deleted.)
  const adopted = disk.groups.filter((g) => !ourIds.has(g.id) && !baseIds.has(g.id));
  const live = new Set([...ourIds, ...adopted.map((g) => g.id)]);

  // Resolve every name either side places.
  const final = new Map<string, Placement>();
  for (const name of new Set([...ourP.keys(), ...diskP.keys()])) {
    const mine = ourP.get(name);
    const touched = mine !== baseP.get(name);
    // A name we can't resolve to a project is ours to keep but never ours to
    // re-place from disk: disk may be describing a project we simply can't see.
    const winner = touched || !known.has(name) ? mine : diskP.get(name);
    if (winner === undefined) continue;
    // A placement into a folder that no longer exists degrades to loose.
    final.set(name, winner !== null && !live.has(winner) ? null : winner);
  }

  // Members per folder: our order first (it's the order the user arranged),
  // then anything newly resolved into it, in disk's within-folder order.
  const membersOf = (g: ProjectGroup, seed: string[]): string[] => {
    const keep = seed.filter((m) => final.get(m) === g.id);
    const have = new Set(keep);
    const add = (disk.groups.find((d) => d.id === g.id)?.members ?? []).filter(
      (m) => !have.has(m) && final.get(m) === g.id,
    );
    add.forEach((m) => have.add(m));
    const rest = [...final]
      .filter(([m, p]) => p === g.id && !have.has(m))
      .map(([m]) => m);
    return [...keep, ...add, ...rest];
  };
  const groups: ProjectGroup[] = [
    ...ours.groups.map((g) => ({ ...g, members: membersOf(g, g.members) })),
    ...adopted.map((g) => ({ ...g, members: membersOf(g, g.members) })),
  ];

  // Order: our tokens (minus names that ended up in a folder), then disk's
  // tokens we don't have yet, then any leftover.
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (token: string) => {
    if (seen.has(token)) return;
    order.push(token);
    seen.add(token);
  };
  const looseToken = (token: string) => final.get(token) === null;
  for (const token of ours.order) {
    if (groupIdOf(token) === null) {
      if (looseToken(token)) push(token);
    } else if (live.has(groupIdOf(token)!)) push(token);
  }
  for (const token of disk.order) {
    const gid = groupIdOf(token);
    if (gid === null) {
      if (looseToken(token)) push(token);
    } else if (adopted.some((g) => g.id === gid)) push(token);
  }
  for (const g of groups) push(groupToken(g.id));
  for (const [name, placement] of final) if (placement === null) push(name);

  return { order, groups };
}
