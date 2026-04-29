// Lightweight path helpers used in terminal output handling and file viewers.
// We avoid `node:path` (browser bundle) and the more thorough OS-aware helpers
// it would pull in — these only need to handle POSIX-style paths the desktop
// app is producing.

// Returns rel as-is if absolute, otherwise resolves it against base. Strips
// leading `./` segments. Empty base returns the cleaned relative path; empty
// relative returns base unchanged.
export function joinAbs(base: string, rel: string): string {
  if (rel.startsWith("/")) return rel;
  let cleaned = rel;
  while (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  if (!base) return cleaned;
  if (!cleaned) return base;
  return base.endsWith("/") ? base + cleaned : base + "/" + cleaned;
}

// Returns absPath relative to root when absPath sits under root; otherwise
// returns absPath unchanged. Empty root returns absPath unchanged.
export function relTo(absPath: string, root: string): string {
  if (!root) return absPath;
  const prefix = root.endsWith("/") ? root : root + "/";
  return absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
}

export function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
