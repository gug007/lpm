import { makeTerminal, mapPane, type PaneNode } from "../../paneTree";

// Put the fresh terminal `newId` where `oldId` was in pane `paneId`, keeping
// what makes it the same tab to the user: its name, agent session and the
// memory session and fork it carries, launch command, pin and colour, and
// whether only the host had it.
export function swapTerminal(tree: PaneNode, paneId: string, oldId: string, newId: string): PaneNode {
  return mapPane(tree, paneId, (p) => ({
    ...p,
    tabs: p.tabs.map((t) =>
      t.id === oldId
        ? makeTerminal(newId, t.label, {
            sessionTitle: t.sessionTitle,
            sessionTitleId: t.sessionTitleId,
            sessionTitleSource: t.sessionTitleSource,
            historyKey: t.historyKey,
            startCmd: t.startCmd,
            resumeCmd: t.resumeCmd,
            actionName: t.actionName,
            memory: t.memory,
            forkOf: t.forkOf,
            pinned: t.pinned,
            emoji: t.emoji,
            color: t.color,
            fromHost: t.fromHost,
          })
        : t,
    ),
  }));
}
