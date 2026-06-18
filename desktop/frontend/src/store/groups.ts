import { LoadGroups, SaveGroups } from "../../bridge/commands";
import type { ProjectGroup } from "../types";

// Sidebar folders live in ~/.lpm/groups.json, owned entirely by the frontend.
// The backend just round-trips this shape (load_groups/save_groups), so the
// normalization below is the contract: a `groups` array of well-formed folders.
export interface GroupsConfig {
  groups: ProjectGroup[];
}

function normalizeGroup(raw: unknown): ProjectGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<ProjectGroup>;
  if (typeof g.id !== "string" || !g.id) return null;
  return {
    id: g.id,
    name: typeof g.name === "string" ? g.name : "",
    collapsed: g.collapsed === true ? true : undefined,
    members: Array.isArray(g.members)
      ? g.members.filter((m): m is string => typeof m === "string")
      : [],
  };
}

function normalize(raw: unknown): GroupsConfig {
  const groups = (raw as { groups?: unknown })?.groups;
  return {
    groups: Array.isArray(groups)
      ? groups.map(normalizeGroup).filter((g): g is ProjectGroup => g !== null)
      : [],
  };
}

export async function loadGroups(): Promise<GroupsConfig> {
  try {
    return normalize(await LoadGroups());
  } catch {
    return { groups: [] };
  }
}

export function saveGroups(cfg: GroupsConfig): Promise<void> {
  return SaveGroups(cfg);
}
