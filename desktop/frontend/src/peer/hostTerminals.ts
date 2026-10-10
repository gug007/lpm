import { isPeerName, peerRawName } from "./markers";

// A terminal running on a peer host, as the host lists it for a project. The id
// is peer-marked; the label is the host's tab name, absent when it has none.
export interface HostTerminal {
  id: string;
  label?: string;
  pinned: boolean;
  emoji?: string;
}

// Peer terminals this Mac has had a tab for. A sync never opens one of these
// again: a tab the user just closed can still be alive on the host for a moment
// (its stop in flight, or held behind the undo toast), and reopening it would
// undo the close.
const claimed = new Set<string>();

// Terminal starts sent to each host that haven't answered yet. The host can list
// a new terminal before its id comes back here, and adopting it then would open
// it twice: once from the listing, once from the start that asked for it.
const startsInFlight = new Map<string, number>();

export function claimPeerTerminal(id: string): void {
  if (isPeerName(id)) claimed.add(id);
}

export function beginPeerStart(slug: string): void {
  startsInFlight.set(slug, (startsInFlight.get(slug) ?? 0) + 1);
}

export function endPeerStart(slug: string): void {
  const left = (startsInFlight.get(slug) ?? 0) - 1;
  if (left > 0) startsInFlight.set(slug, left);
  else startsInFlight.delete(slug);
}

export function isPeerStartInFlight(slug: string): boolean {
  return startsInFlight.has(slug);
}

function parseHostTerminal(value: unknown): HostTerminal | null {
  if (!value || typeof value !== "object") return null;
  const t = value as { id?: unknown; label?: unknown; pinned?: unknown; emoji?: unknown };
  if (typeof t.id !== "string" || !isPeerName(t.id)) return null;
  // A host with no name for a tab reports its pty id instead.
  const label =
    typeof t.label === "string" && t.label && t.label !== peerRawName(t.id) ? t.label : undefined;
  const emoji = typeof t.emoji === "string" && t.emoji ? t.emoji : undefined;
  return { id: t.id, label, pinned: t.pinned === true, emoji };
}

// The host's terminals that should open as tabs here: everything it lists that
// this Mac has never had a tab for. `openIds` are the tabs open now, claimed on
// the way so a later close can't bring them back.
export function unclaimedHostTerminals(
  listed: unknown,
  openIds: Iterable<string>,
): HostTerminal[] {
  for (const id of openIds) claimPeerTerminal(id);
  if (!Array.isArray(listed)) return [];
  return listed
    .map(parseHostTerminal)
    .filter((t): t is HostTerminal => t !== null && !claimed.has(t.id));
}
