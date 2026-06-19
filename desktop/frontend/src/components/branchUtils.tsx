import { main } from "../../bridge/models";

export function branchKey(b: main.Branch): string {
  return b.remote ? `${b.remote}/${b.name}` : b.name;
}

export function branchMatches(b: main.Branch, query: string): boolean {
  return b.name.toLowerCase().includes(query.toLowerCase());
}

// Pick the list to show — recent branches, debounced search results, or a
// cached-list fallback — then sort the current local branch first, locals
// before remotes. Stable sort preserves the backend's committer-date order.
export function orderBranches(
  branches: main.Branch[],
  query: string,
  searchResults: main.Branch[] | null,
  current: string,
): main.Branch[] {
  const base = !query
    ? branches
    : searchResults !== null
      ? searchResults
      : branches.filter((b) => branchMatches(b, query));
  const rank = (b: main.Branch) => (b.name === current && !b.remote ? 0 : b.remote ? 2 : 1);
  return [...base].sort((a, b) => rank(a) - rank(b));
}

export function RemoteBadge({ remote }: { remote: string }) {
  return (
    <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
      {remote}
    </span>
  );
}
