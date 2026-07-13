const STORAGE_KEY = "lpm-peer-sections-collapsed";

export function parseCollapsedMap(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [slug, value] of Object.entries(parsed)) {
      if (value === true) out[slug] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function readCollapsed(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  return parseCollapsedMap(localStorage.getItem(STORAGE_KEY));
}

export function isPeerSectionCollapsed(slug: string): boolean {
  return readCollapsed()[slug] === true;
}

export function setPeerSectionCollapsed(slug: string, collapsed: boolean): void {
  if (typeof localStorage === "undefined") return;
  const map = readCollapsed();
  if (collapsed) map[slug] = true;
  else delete map[slug];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage may be full or disabled */
  }
}
