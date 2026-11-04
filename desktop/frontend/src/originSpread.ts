import { autoPullProject, maybeAutoPull } from "./autoPullRun";
import { recheckOrigin } from "./originActions";
import type { OriginStatus } from "./originStatus";
import { peerSlugOf } from "./peer/markers";
import { useOriginStatus, type OriginEntry } from "./store/originStatus";

// A push or fetch that moves origin in one project leaves every other copy of
// that repository on that branch behind, and none of them knows until its next
// round of fetches. Each Mac fetches its own copies right away, those auto pull
// would act on, one at a time. A paired Mac that has no copy with the commit yet
// gets one of its copies fetched; its own watcher then spreads the commit to the
// rest by that Mac's settings.

// Each queued root, and the upstream commit it should reach.
const queue = new Map<string, string>();
let draining = false;

export function originMoved(prev: OriginStatus | undefined, next: OriginStatus): boolean {
  return (
    !!next.upstreamKey &&
    !!next.upstreamSha &&
    !!prev?.upstreamSha &&
    prev.upstreamKey === next.upstreamKey &&
    prev.upstreamSha !== next.upstreamSha
  );
}

const reached = (entries: Record<string, OriginEntry>, slug: string, sha: string) =>
  Object.entries(entries).some(([root, e]) => peerSlugOf(root) === slug && e.status.upstreamSha === sha);

// The copies to fetch now that `root`'s upstream is at `status`'s commit: every
// other copy here that could fast-forward to it, and one per paired Mac none of
// whose copies has it, the Mac it came from included.
export function copiesToFetch(
  root: string,
  status: OriginStatus,
  entries: Record<string, OriginEntry>,
): string[] {
  const sha = status.upstreamSha ?? "";
  const peers = new Set<string>();
  const source = peerSlugOf(root);
  if (source) peers.add(source);
  return Object.entries(entries)
    .filter(([other, { status: s }]) => {
      if (other === root || s.upstreamKey !== status.upstreamKey || s.upstreamSha === sha) return false;
      if (!s.hasUpstream || s.ahead > 0 || s.conflicted) return false;
      const slug = peerSlugOf(other);
      if (!slug) return true;
      if (peers.has(slug) || reached(entries, slug, sha)) return false;
      peers.add(slug);
      return true;
    })
    .map(([other]) => other);
}

function stillBehind(root: string, sha: string): boolean {
  const entries = useOriginStatus.getState().entries;
  const entry = entries[root];
  if (!entry || entry.running || entry.status.upstreamSha === sha) return false;
  const slug = peerSlugOf(root);
  return slug ? !reached(entries, slug, sha) : !!autoPullProject(root);
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (const [root, sha] of queue) {
      queue.delete(root);
      if (!stillBehind(root, sha)) continue;
      await recheckOrigin(root, true);
      await maybeAutoPull(root);
    }
  } finally {
    draining = false;
  }
}

// Fetch the copies behind each move the origin store records, until the
// returned stop is called.
export function followOriginMoves(): () => void {
  const unsubscribe = useOriginStatus.subscribe((state, prev) => {
    for (const [root, entry] of Object.entries(state.entries)) {
      if (!originMoved(prev.entries[root]?.status, entry.status)) continue;
      const sha = entry.status.upstreamSha ?? "";
      for (const copy of copiesToFetch(root, entry.status, state.entries)) queue.set(copy, sha);
      void drain();
    }
  });
  return () => {
    unsubscribe();
    queue.clear();
  };
}
