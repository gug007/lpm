import { agentSessionOf } from "../../agentSession";
import { type HostTerminal } from "../../peer/hostTerminals";
import {
  type PaneNode,
  type TerminalInstance,
  clampIdx,
  collectPanes,
  collectTerminals,
  findPane,
  findTerminalLocation,
  firstPaneId,
  makePaneLeaf,
  makeTerminal,
  mapPane,
  removePane,
  terminalDisplayLabel,
} from "../../paneTree";
import { isPeerName } from "../../peer/markers";
import { disambiguateLabel, pickTerminalLabel } from "../../terminalLabels";
import { withAgentSession } from "./agentSessionTab";
import { swapTerminal } from "./swapTerminal";
import { nextId } from "./util";

// Appends the host's terminals behind the tab in view, so one opening on the
// host never pulls focus from what's being typed into here. Into an empty
// project they open as its first pane.
export function withHostTabs(
  tree: PaneNode | null,
  focusedPaneId: string | null,
  terminals: HostTerminal[],
): { tree: PaneNode; focus?: string } {
  const paneId = !tree
    ? nextId("pane")
    : focusedPaneId && findPane(tree, focusedPaneId)
      ? focusedPaneId
      : firstPaneId(tree);
  let next: PaneNode = tree ?? makePaneLeaf(paneId, []);
  for (const t of terminals) {
    const label = t.label ? disambiguateLabel(next, t.label) : pickTerminalLabel(next);
    const tab = withHostSession(
      makeTerminal(t.id, label, { pinned: t.pinned, emoji: t.emoji, fromHost: true }),
      t,
    );
    next = mapPane(next, paneId, (p) => ({ ...p, tabs: [...p.tabs, tab] }));
  }
  return tree ? { tree: next } : { tree: next, focus: paneId };
}

// The host moved a tab to a new terminal (a Claude account switch): one new
// here that carries the conversation of a tab the host no longer lists. That
// tab takes the new terminal in place, keeping its spot, focus and name, rather
// than closing while a new tab opens at the end. Only a host that lists its
// tabs can say one is gone.
export function withReplacedHostTabs(
  tree: PaneNode,
  fresh: HostTerminal[],
  hostTabs: string[] | null,
): { tree: PaneNode; replaced: { from: string; to: string }[] } {
  const replaced: { from: string; to: string }[] = [];
  if (!hostTabs) return { tree, replaced };
  const listed = new Set(hostTabs);
  let next = tree;
  for (const t of fresh) {
    const session = t.agentSession;
    if (!session) continue;
    const holds = (tab: TerminalInstance) => {
      const own = agentSessionOf(tab);
      return (
        isPeerName(tab.id) &&
        !listed.has(tab.id) &&
        own?.provider === session.provider &&
        own.sessionId === session.sessionId
      );
    };
    const old = collectTerminals(next).find(holds);
    const at = old && findTerminalLocation(next, old.id);
    if (!old || !at) continue;
    next = swapTerminal(next, at.paneId, old.id, t.id);
    replaced.push({ from: old.id, to: t.id });
  }
  return { tree: next, replaced };
}

// Drops the tabs the host closed. A pane left with nothing collapses, as a close
// here would collapse it, and focus moves on only when its pane went.
export function withoutHostTabs(
  tree: PaneNode,
  focusedPaneId: string | null,
  ids: ReadonlySet<string>,
): { tree: PaneNode | null; focus?: string | null } {
  let next: PaneNode | null = tree;
  for (const pane of collectPanes(tree)) {
    if (!next || !pane.tabs.some((t) => ids.has(t.id))) continue;
    const tabs = pane.tabs.filter((t) => !ids.has(t.id));
    if (tabs.length === 0 && !pane.activeServiceName) {
      next = removePane(next, pane.id);
      continue;
    }
    const kept = tabs.indexOf(pane.tabs[pane.activeTabIdx]);
    const activeTabIdx = kept >= 0 ? kept : clampIdx(pane.activeTabIdx, tabs.length);
    next = mapPane(next, pane.id, (p) => ({ ...p, tabs, activeTabIdx }));
  }
  if (!focusedPaneId || (next && findPane(next, focusedPaneId))) return { tree: next };
  return { tree: next, focus: next ? firstPaneId(next) : null };
}

// Brings the host's tabs here in line with the host: each takes the host's name,
// pin and icon, and within every pane they stand in the host's order (`order`,
// its full tab list). Tabs the host doesn't list keep their places. The same
// tree comes back when nothing changed.
export function followHostTabs(
  tree: PaneNode,
  terminals: HostTerminal[],
  order: string[],
): PaneNode {
  const rank = new Map(order.map((id, i) => [id, i]));
  terminals.forEach((t, i) => {
    if (!rank.has(t.id)) rank.set(t.id, order.length + i);
  });
  const byId = new Map(terminals.map((t) => [t.id, t]));
  let next = tree;
  for (const pane of collectPanes(tree)) {
    const slots = pane.tabs.flatMap((t, i) => (rank.has(t.id) ? [i] : []));
    const ranked = slots.map((i) => pane.tabs[i]).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const tabs = [...pane.tabs];
    slots.forEach((slot, k) => (tabs[slot] = ranked[k]));
    const named = tabs.map((t) => {
      const host = byId.get(t.id);
      return host ? withHostSession(withHostNames(t, host), host) : t;
    });
    if (named.every((t, i) => t === pane.tabs[i])) continue;
    const activeId = pane.tabs[pane.activeTabIdx]?.id;
    const activeTabIdx = named.findIndex((t) => t.id === activeId);
    next = mapPane(next, pane.id, (p) => ({
      ...p,
      tabs: named,
      activeTabIdx: activeTabIdx >= 0 ? activeTabIdx : p.activeTabIdx,
    }));
  }
  return next;
}

// The host's name wins over any this Mac would give the tab, the agent's
// conversation title included: the host already folds that into its own.
function withHostNames(t: TerminalInstance, host: HostTerminal): TerminalInstance {
  const renamed = !!host.label && terminalDisplayLabel(t) !== host.label;
  const repinned = !!t.pinned !== host.pinned;
  const reiconed = (t.emoji || undefined) !== host.emoji;
  if (!renamed && !repinned && !reiconed) return t;
  const next: TerminalInstance = { ...t, emoji: host.emoji, pinned: host.pinned || undefined };
  if (!renamed) return next;
  return {
    ...next,
    label: host.label!,
    sessionTitle: undefined,
    sessionTitleId: undefined,
    sessionTitleSource: "manual",
  };
}

// A tab that never heard its agent name the conversation — it opened here after
// the agent started — takes the one the host knows, which makes it the agent tab
// it is: model picker, Resume, Fork. A tab that did hear keeps its own, since the
// host's listing can trail the event that moved it on.
function withHostSession(t: TerminalInstance, host: HostTerminal): TerminalInstance {
  return host.agentSession && !agentSessionOf(t) ? withAgentSession(t, host.agentSession) : t;
}
