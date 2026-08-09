// A project shows its agents unless the user closed that row, so what persists
// is the exceptions — the rows they collapsed.
const STORAGE_KEY = "lpm-sidebar-collapsed-projects";

function parseCollapsed(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((name): name is string => typeof name === "string"));
  } catch {
    return new Set();
  }
}

export function readCollapsedProjects(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  return parseCollapsed(localStorage.getItem(STORAGE_KEY));
}

export function writeCollapsedProjects(names: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
  } catch {
    /* storage may be full or disabled */
  }
}
