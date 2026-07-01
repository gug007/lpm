// Per-project throttle for the branch picker's background remote prune, so
// repeatedly reopening the picker doesn't hit the network each time. Keyed by
// project path with a 30s window.
const FETCH_DEBOUNCE_MS = 30_000;
const FETCH_MAP_CAP = 50;
const lastFetchAt = new Map<string, number>();

export function shouldFetch(path: string): boolean {
  return Date.now() - (lastFetchAt.get(path) ?? 0) > FETCH_DEBOUNCE_MS;
}

export function recordFetch(path: string): void {
  lastFetchAt.set(path, Date.now());
  if (lastFetchAt.size > FETCH_MAP_CAP) {
    const oldest = lastFetchAt.keys().next().value;
    if (oldest !== undefined) lastFetchAt.delete(oldest);
  }
}
