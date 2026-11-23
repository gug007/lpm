// JSON kept in localStorage. Storage can be off (private mode), full, or hold
// what another build wrote, so a read falls back and a write may not stick.

/** The value under `key` as `accept` takes it, else `fallback`. */
export function readLocalJson<T>(key: string, accept: (value: unknown) => T | undefined, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (accept(JSON.parse(raw)) ?? fallback);
  } catch {
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kept in memory until the app reloads.
  }
}
