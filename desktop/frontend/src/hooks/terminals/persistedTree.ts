import {
  StartTerminal,
  StartTerminalForRestore,
  TerminalExists,
} from "../../../bridge/commands";
import { isPeerMarked } from "../../peer/markers";
import {
  type PersistedPaneNode,
  type PersistedTab,
  type PersistedTerminalEntry,
} from "../../terminals";
import {
  type PaneNode,
  type TerminalInstance,
  collectTerminals,
  followsAgentTitle,
  makePaneLeaf,
  makeTerminal,
  clampIdx,
  terminalDisplayLabel,
  isTerminalTab,
} from "../../paneTree";
import { disambiguateLabelAgainst } from "../../terminalLabels";
import { nextId } from "./util";

/**
 * Walks a persisted tree and launches a fresh PTY for each terminal in
 * every leaf pane. Tabs within a pane are started in parallel; split
 * subtrees (`a` and `b`) are also reified in parallel.
 *
 * Tolerant of partial failure: a tab whose PTY won't start is dropped into
 * `dropped` and the rest of the tree still comes back, and a split whose side
 * came back empty collapses to its sibling. Losing every tab because one
 * action was renamed or one SSH host is unreachable would strand whole
 * sessions. Returns null only when nothing at all could be restored; the
 * caller stops the PTYs launched so far via `startedIds`.
 */
export async function reifyTreeWithFreshPtys(
  node: PersistedPaneNode,
  projectName: string,
  startedIds: string[],
  dropped: PersistedTab[] = [],
): Promise<PaneNode | null> {
  const restored = await reifyTree(node, projectName, startedIds, dropped);
  return restored ? disambiguateRestoredSessionTitles(restored) : null;
}

// How long a restore waits for the peer connection before deciding what to do
// with a terminal it can't ask about. Restore routinely beats the connection by a
// second or two on a cold start, and the tabs are checked in parallel, so this is
// one short wait for the whole tree rather than one per tab.
const PEER_CHECK_WINDOW_MS = 8000;
const PEER_CHECK_RETRY_MS = 500;

/**
 * Whether to adopt a persisted peer terminal rather than launch a new one.
 *
 * Three outcomes, and the third is the one that bites. `true` — the host still
 * has it. `false` — the host genuinely lost it, so a fresh pty is right. But
 * "couldn't ask" is neither: launching a terminal we failed to verify leaves the
 * real one running on the host with nothing attached to it — a stranded agent
 * burning tokens, plus a duplicate nobody can reconcile.
 *
 * So retry across a short window first, which covers the ordinary cold start
 * where restore simply got there before the peer connected. If it still can't be
 * asked, adopt on faith: the host keeps its terminals across our restart by
 * design, so the id is far more likely live than not, and the attach re-subscribes
 * by itself once the peer connects. Being wrong costs a blank pane the user can
 * close; the other way costs a running agent.
 */
async function shouldAdoptPeerTerminal(id: string): Promise<boolean> {
  const deadline = Date.now() + PEER_CHECK_WINDOW_MS;
  for (;;) {
    try {
      return await TerminalExists(id);
    } catch {
      if (Date.now() >= deadline) return true;
      await new Promise((resolve) => setTimeout(resolve, PEER_CHECK_RETRY_MS));
    }
  }
}

/**
 * The pty backing a restored tab: an existing one when this is a peer terminal
 * that outlived us, else a freshly started pty.
 *
 * A local pty dies with the app, so its persisted id is always stale. A peer
 * terminal does not — it belongs to the other machine, which kept it running
 * (along with its scrollback ring) while we were closed. Relaunching that would
 * strand the live session and any agent inside it, and hand back an empty pane;
 * adopting the id instead lets the normal attach path replay the host's
 * scrollback.
 */
async function reifyTab(
  t: PersistedTab,
  projectName: string,
): Promise<{ id: string; adopted: boolean }> {
  if (t.id && isPeerMarked(t.id)) {
    if (await shouldAdoptPeerTerminal(t.id)) return { id: t.id, adopted: true };
  }
  const id = await (t.actionName
    ? StartTerminalForRestore(projectName, t.actionName)
    : StartTerminal(projectName));
  return { id, adopted: false };
}

async function reifyTree(
  node: PersistedPaneNode,
  projectName: string,
  startedIds: string[],
  dropped: PersistedTab[],
): Promise<PaneNode | null> {
  if (node.kind === "leaf") {
    const persistedTabs = node.tabs ?? [];
    // A service-only pane (no interactive terminals, just an active service
    // tab) is allowed. A truly empty pane is dropped.
    if (persistedTabs.length === 0 && !node.activeServiceName) return null;
    const results = await Promise.allSettled(persistedTabs.map((t) => reifyTab(t, projectName)));
    const tabs: TerminalInstance[] = [];
    // Persisted index -> index in the surviving tabs, so the active tab stays
    // selected when an earlier tab dropped out.
    const newIdx: number[] = [];
    results.forEach((result, i) => {
      const t = persistedTabs[i];
      if (result.status !== "fulfilled") {
        newIdx.push(-1);
        dropped.push(t);
        return;
      }
      const { id, adopted } = result.value;
      // Only ptys we launched go in `startedIds` — the caller stops those when
      // the restore fails outright, and an adopted terminal is someone's live
      // session (very possibly a running agent), not ours to kill.
      if (!adopted) startedIds.push(id);
      newIdx.push(tabs.length);
      tabs.push(
        makeTerminal(id, t.label ?? "Terminal", {
          sessionTitle: t.sessionTitle,
          sessionTitleId: t.sessionTitleId,
          sessionTitleSource: t.sessionTitleSource,
          historyKey: t.historyKey,
          startCmd: t.startCmd,
          resumeCmd: t.resumeCmd,
          actionName: t.actionName,
          pinned: t.pinned,
          emoji: t.emoji,
          color: t.color,
        }),
      );
    });
    if (tabs.length === 0 && !node.activeServiceName) return null;
    const savedActive = newIdx[clampIdx(node.activeTabIdx, persistedTabs.length)] ?? -1;
    const activeTabIdx =
      savedActive >= 0 ? savedActive : clampIdx(node.activeTabIdx, tabs.length);
    const pane = makePaneLeaf(nextId("pane"), tabs, activeTabIdx);
    if (node.activeServiceName) pane.activeServiceName = node.activeServiceName;
    return pane;
  }
  if (!node.a || !node.b) return null;
  const [a, b] = await Promise.all([
    reifyTree(node.a, projectName, startedIds, dropped),
    reifyTree(node.b, projectName, startedIds, dropped),
  ]);
  if (!a || !b) return a ?? b;
  return {
    kind: "split",
    direction: node.direction === "col" ? "col" : "row",
    ratio: typeof node.ratio === "number" ? node.ratio : 0.5,
    a,
    b,
  };
}

// Restored titles are made unique against the labels that can't move — tabs
// with no title of their own, and manually named ones.
function disambiguateRestoredSessionTitles(node: PaneNode): PaneNode {
  const movableTitle = (tab: TerminalInstance): tab is TerminalInstance &
    { sessionTitle: string } => !!tab.sessionTitle && followsAgentTitle(tab);
  const usedLabels = collectTerminals(node)
    .filter((tab) => !movableTitle(tab))
    .map(terminalDisplayLabel);
  const visit = (current: PaneNode): PaneNode => {
    if (current.kind === "split") {
      return { ...current, a: visit(current.a), b: visit(current.b) };
    }
    return {
      ...current,
      tabs: current.tabs.map((tab) => {
        if (!movableTitle(tab)) return tab;
        const title = disambiguateLabelAgainst(tab.sessionTitle, usedLabels);
        usedLabels.push(title);
        return title === tab.sessionTitle
          ? tab
          : { ...tab, sessionTitle: title };
      }),
    };
  };
  return visit(node);
}

/**
 * Strips live PTY ids before persisting — a local pty dies with the app, so its
 * id won't be valid after a restart. label/startCmd/resumeCmd are kept so
 * restore can re-inject them.
 *
 * A PEER terminal's id is the exception worth keeping: it names a pty on the
 * other machine, which keeps running while we're closed, so the id is still
 * good when we come back and `reifyTab` can adopt the live session instead of
 * stranding it. (The host side also parks an id here for adopted tabs while a
 * project is unmounted; those are unmarked local ids, so the two never collide.)
 */
export function treeToPersisted(node: PaneNode): PersistedPaneNode {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      activeTabIdx: node.activeTabIdx,
      ...(node.activeServiceName ? { activeServiceName: node.activeServiceName } : {}),
      // Only terminal tabs persist; non-PTY tabs (browser webviews, review
      // diffs) are ephemeral and don't survive restart.
      tabs: node.tabs
        .filter(isTerminalTab)
        .map((t) => ({
          label: t.label,
          ...(isPeerMarked(t.id) ? { id: t.id } : {}),
          ...(t.sessionTitle ? { sessionTitle: t.sessionTitle } : {}),
          ...(t.sessionTitleId ? { sessionTitleId: t.sessionTitleId } : {}),
          ...(t.sessionTitleSource ? { sessionTitleSource: t.sessionTitleSource } : {}),
          ...(t.historyKey ? { historyKey: t.historyKey } : {}),
          ...(t.startCmd ? { startCmd: t.startCmd } : {}),
          ...(t.resumeCmd ? { resumeCmd: t.resumeCmd } : {}),
          ...(t.actionName ? { actionName: t.actionName } : {}),
          ...(t.pinned ? { pinned: true } : {}),
          ...(t.emoji ? { emoji: t.emoji } : {}),
          ...(t.color ? { color: t.color } : {}),
        })),
    };
  }
  return {
    kind: "split",
    direction: node.direction,
    ratio: node.ratio,
    a: treeToPersisted(node.a),
    b: treeToPersisted(node.b),
  };
}

export function legacyEntriesToTree(entries: PersistedTerminalEntry[] | undefined): PersistedPaneNode | null {
  if (!entries || entries.length === 0) return null;
  return {
    kind: "leaf",
    activeTabIdx: 0,
    tabs: entries.map((e) => ({
      label: e.label,
      ...(e.startCmd ? { startCmd: e.startCmd } : {}),
      ...(e.resumeCmd ? { resumeCmd: e.resumeCmd } : {}),
    })),
  };
}
