import { useEffect, type RefObject } from "react";
import { ListProjectTerminals, TerminalExists } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { isPeerName, peerSlugOf } from "../../peer/markers";
import {
  type HostListing,
  type HostTabsSeen,
  type HostTerminal,
  claimPeerTerminal,
  hostClosedTabs,
  hostTerminalsOf,
  isPeerStartInFlight,
  parseHostListing,
  releasePeerTerminal,
  tabsLeftByRestart,
  unclaimedHostTerminals,
} from "../../peer/hostTerminals";
import { noteHostFollows } from "../../peer/hostFollows";
import { settleHostSwap } from "../../peer/hostSwaps";
import { noteOpenedByOtherMac } from "../../peer/openedByOtherMac";
import { pendingClosesForProject } from "../../pendingClose";
import { type PaneNode, collectTerminals } from "../../paneTree";
import { onTerminalsClosed } from "../../sendLater/closeout";
import { followHostTabs, withHostTabs, withReplacedHostTabs, withoutHostTabs } from "./hostTabs";

// A start still waiting on its reply holds a sync back; this is how soon it
// tries again.
const START_RETRY_MS = 1000;

interface UsePeerTerminalSyncProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  focusedRef: RefObject<string | null>;
  restoreSettled: RefObject<Promise<void>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
}

// A peer project shows what runs on the host, not just what this Mac opened
// there: an agent started at the host's own keyboard, from a phone or from
// another Mac opens here as a tab too, and a tab closed there closes here. A host
// that says so (`follow`) also sets the tabs' names and order, and after it
// restarts its restored tabs replace the ones that ended with it.
// Synced when the project mounts, when the host's tabs change, and when this
// window comes back into focus.
export function usePeerTerminalSync({
  projectName,
  treeRef,
  focusedRef,
  restoreSettled,
  applyTree,
}: UsePeerTerminalSyncProps) {
  useEffect(() => {
    if (IS_MIRROR_WINDOW || !isPeerName(projectName)) return;
    const slug = peerSlugOf(projectName)!;
    let disposed = false;
    let running = false;
    let rerun = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const seen: HostTabsSeen = { run: null, ids: new Set() };

    // A tab the host moved to a new terminal takes it in place.
    const replace = (listing: HostListing, fresh: HostTerminal[]): HostTerminal[] => {
      const tree = treeRef.current;
      if (!tree) return fresh;
      const swapped = withReplacedHostTabs(tree, fresh, listing.tabs);
      if (swapped.replaced.length === 0) return fresh;
      applyTree(swapped.tree);
      const taken = new Set<string>();
      for (const { from, to } of swapped.replaced) {
        claimPeerTerminal(to);
        taken.add(to);
        settleHostSwap(from, to);
      }
      return fresh.filter((t) => !taken.has(t.id));
    };

    const adopt = (listing: HostListing) => {
      const openIds = [
        ...(treeRef.current ? collectTerminals(treeRef.current).map((t) => t.id) : []),
        ...pendingClosesForProject(projectName).map((p) => p.tab.id),
      ];
      const fresh = replace(listing, unclaimedHostTerminals(listing.terminals, openIds));
      if (fresh.length === 0) return;
      const tree = treeRef.current;
      for (const t of fresh) {
        claimPeerTerminal(t.id);
        noteOpenedByOtherMac(t.id);
      }
      const next = withHostTabs(tree, focusedRef.current, fresh);
      applyTree(next.tree, next.focus);
    };

    const drop = (closed: Set<string>) => {
      const tree = treeRef.current;
      if (!tree || closed.size === 0) return;
      const tabs = collectTerminals(tree);
      closed.forEach(releasePeerTerminal);
      const next = withoutHostTabs(tree, focusedRef.current, closed);
      applyTree(next.tree, next.focus);
      onTerminalsClosed(
        projectName,
        tabs.filter((t) => closed.has(t.id)).map((t) => t.historyKey),
      );
    };

    const dropClosed = (listing: HostListing) => {
      const tree = treeRef.current;
      if (!tree) return;
      const openIds = collectTerminals(tree).map((t) => t.id);
      drop(new Set(hostClosedTabs(seen, listing, openIds)));
    };

    // Ended with the host's last run: whatever it no longer has, once it says so.
    const dropEnded = async (previousRun: string | null, listing: HostListing) => {
      const tree = treeRef.current;
      if (!tree) return;
      const openIds = collectTerminals(tree).map((t) => t.id);
      const left = tabsLeftByRestart(previousRun, listing, openIds);
      if (!left?.length) return;
      const alive = await Promise.all(left.map((id) => TerminalExists(id).catch(() => true)));
      if (disposed) return;
      drop(new Set(left.filter((_, i) => !alive[i])));
    };

    const follow = (listing: HostListing) => {
      const tree = treeRef.current;
      if (!listing.follow || !tree) return;
      const hostTabs = hostTerminalsOf(listing.terminals);
      const next = followHostTabs(tree, hostTabs, listing.tabs ?? hostTabs.map((t) => t.id));
      if (next === tree) return;
      applyTree(next);
    };

    const sync = async () => {
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      try {
        await restoreSettled.current;
        const listed = await ListProjectTerminals(projectName, true).catch(() => null);
        if (disposed || listed === null) return;
        if (isPeerStartInFlight(slug)) {
          if (!retry) {
            retry = setTimeout(() => {
              retry = null;
              void sync();
            }, START_RETRY_MS);
          }
          return;
        }
        const listing = parseHostListing(listed);
        noteHostFollows(projectName, listing.follow);
        const previousRun = seen.run;
        adopt(listing);
        dropClosed(listing);
        await dropEnded(previousRun, listing);
        if (disposed) return;
        follow(listing);
      } finally {
        running = false;
        if (rerun && !disposed) {
          rerun = false;
          void sync();
        }
      }
    };

    void sync();
    const offChanged = EventsOn("terminals-changed", (project: string) => {
      if (project === projectName) void sync();
    });
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      offChanged();
      window.removeEventListener("focus", onFocus);
    };
  }, [projectName, applyTree]);
}
