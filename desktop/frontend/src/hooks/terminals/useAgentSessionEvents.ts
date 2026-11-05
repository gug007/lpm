import { useEffect, type RefObject } from "react";
import { EventsOn } from "../../../bridge/runtime";
import {
  agentSessionOf,
  isValidAgentSessionId,
  type AgentSessionProvider,
} from "../../agentSession";
import {
  collectPanes,
  isTerminalTab,
  mapPane,
  type PaneNode,
} from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { withAgentSession } from "./agentSessionTab";

export interface AgentSessionEvent {
  project: string;
  paneId: string;
  provider: AgentSessionProvider;
  sessionId: string;
}

function isAgentSessionEvent(payload: unknown): payload is AgentSessionEvent {
  if (!payload || typeof payload !== "object") return false;
  const event = payload as Partial<AgentSessionEvent>;
  return (
    typeof event.project === "string" &&
    event.project.length > 0 &&
    typeof event.paneId === "string" &&
    event.paneId.length > 0 &&
    (event.provider === "claude" || event.provider === "codex") &&
    typeof event.sessionId === "string" &&
    isValidAgentSessionId(event.sessionId)
  );
}

export function applyAgentSessionEvent(
  tree: PaneNode | null,
  projectName: string,
  payload: unknown,
): PaneNode | null {
  if (!tree || !isAgentSessionEvent(payload) || payload.project !== projectName) {
    return tree;
  }
  const host = collectPanes(tree).find((pane) =>
    pane.tabs.some((tab) => tab.id === payload.paneId && isTerminalTab(tab)),
  );
  if (!host) return tree;

  return mapPane(tree, host.id, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) =>
      tab.id === payload.paneId
        ? withAgentSession(tab, { provider: payload.provider, sessionId: payload.sessionId })
        : tab,
    ),
  }));
}

export interface AgentSessionEndedEvent {
  project: string;
  paneId: string;
  sessionId: string;
}

function isAgentSessionEndedEvent(payload: unknown): payload is AgentSessionEndedEvent {
  if (!payload || typeof payload !== "object") return false;
  const event = payload as Partial<AgentSessionEndedEvent>;
  return (
    typeof event.project === "string" &&
    typeof event.paneId === "string" &&
    typeof event.sessionId === "string"
  );
}

// The agent a tab was running has been quit. Only the session the tab still
// follows counts: one the tab has since moved on from says nothing about it.
export function applyAgentSessionEnded(
  tree: PaneNode | null,
  projectName: string,
  payload: unknown,
): PaneNode | null {
  if (!tree || !isAgentSessionEndedEvent(payload) || payload.project !== projectName) {
    return tree;
  }
  const host = collectPanes(tree).find((pane) =>
    pane.tabs.some(
      (tab) =>
        tab.id === payload.paneId &&
        isTerminalTab(tab) &&
        !tab.agentEnded &&
        agentSessionOf(tab)?.sessionId === payload.sessionId,
    ),
  );
  if (!host) return tree;

  return mapPane(tree, host.id, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) =>
      tab.id === payload.paneId ? { ...tab, agentEnded: true } : tab,
    ),
  }));
}

export function useAgentSessionEvents({
  projectName,
  treeRef,
  applyTree,
}: {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
}) {
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    const apply = (
      update: (tree: PaneNode | null, project: string, payload: unknown) => PaneNode | null,
    ) => (payload: unknown) => {
      const current = treeRef.current;
      const next = update(current, projectName, payload);
      if (next !== current) {
        applyTree(next);
      }
    };
    const cancelStart = EventsOn("agent-session", apply(applyAgentSessionEvent));
    const cancelEnd = EventsOn("agent-session-ended", apply(applyAgentSessionEnded));
    return () => {
      cancelStart();
      cancelEnd();
    };
  }, [projectName, treeRef, applyTree]);
}
