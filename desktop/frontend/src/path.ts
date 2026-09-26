// Lightweight path helpers used in terminal output handling and file viewers.
// We avoid `node:path` (browser bundle) and the more thorough OS-aware helpers
// it would pull in — these only need to handle POSIX-style paths the desktop
// app is producing.

import { isPeerRoot, peerSlugOf, prefixRoot } from "./peer/markers";

// Returns rel as-is if absolute or tilde-prefixed (the Rust side expands `~/`),
// otherwise resolves it against base. Strips leading `./` segments. Empty
// base returns the cleaned relative path; empty relative returns base. When
// base is on a paired host, an absolute rel names a path on that same host, so
// it keeps the host's marker instead of pointing at this machine.
export function joinAbs(base: string, rel: string): string {
  if (rel.startsWith("/") || rel.startsWith("~/")) {
    const slug = peerSlugOf(base);
    return slug && !isPeerRoot(rel) ? prefixRoot(slug, rel) : rel;
  }
  if (rel === "~") return rel;
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
