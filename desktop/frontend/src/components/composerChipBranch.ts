import { GitStatus } from "../../bridge/commands";

interface GitStatusLike {
  branch: string;
  detached: boolean;
  isGitRepo: boolean;
  ahead: number;
  behind: number;
}

const FRESH_MS = 10_000;
const reads = new Map<string, { at: number; line: Promise<string | null> }>();

function describe(st: GitStatusLike | null): string | null {
  if (!st?.isGitRepo) return null;
  const name = st.detached ? "detached" : st.branch;
  const drift = [st.ahead ? `${st.ahead} ahead` : "", st.behind ? `${st.behind} behind` : ""].filter(Boolean).join(", ");
  return drift ? `${name} · ${drift}` : name;
}

// The branch line a project chip's preview and card show, null when the folder
// has none. Reading it is a `git status` of the whole worktree, so everything
// that asks within FRESH_MS shares one read: the pointer passing over the chip
// again, or a hover followed by the click that opens the card.
export function chipBranchLine(root: string): Promise<string | null> {
  const hit = reads.get(root);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.line;
  const line = GitStatus(root).then(describe, () => null);
  reads.set(root, { at: Date.now(), line });
  return line;
}
