import { useEffect, type RefObject } from "react";
import { EventsOn } from "../../../bridge/runtime";
import {
  agentProviderOfCommand,
  agentSessionOf,
  buildClaudeResumeCmd,
  isValidAgentSessionId,
  type AgentSessionProvider,
} from "../../agentSession";
import { buildCodexResumeCmd } from "../../codexResume";
import {
  collectPanes,
  followsAgentTitle,
  isTerminalTab,
  mapPane,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { IS_MIRROR_WINDOW } from "../../mirror";

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

function updatedTerminal(
  tab: TerminalInstance,
  event: AgentSessionEvent,
): TerminalInstance {
  const previous = agentSessionOf(tab);
  const changedSession =
    previous?.provider !== event.provider ||
    previous?.sessionId !== event.sessionId;
  const resumeCmd =
    event.provider === "claude"
      ? buildClaudeResumeCmd(tab.resumeCmd ?? tab.startCmd, event.sessionId)
      : buildCodexResumeCmd(
          agentProviderOfCommand(tab.startCmd) === "codex"
            ? tab.startCmd
            : undefined,
          event.sessionId,
        );

  return {
    ...tab,
    agentSession: {
      provider: event.provider,
      sessionId: event.sessionId,
    },
    resumeCmd,
    ...(changedSession && followsAgentTitle(tab)
      ? {
          sessionTitle: undefined,
          sessionTitleId: undefined,
          sessionTitleSource: undefined,
        }
      : {}),
  };
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
      tab.id === payload.paneId ? updatedTerminal(tab, payload) : tab,
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
    const cancel = EventsOn("agent-session", (payload: unknown) => {
      const current = treeRef.current;
      const next = applyAgentSessionEvent(current, projectName, payload);
      if (next !== current) {
        treeRef.current = next;
        applyTree(next);
      }
    });
    return () => {
      cancel();
    };
  }, [projectName, treeRef, applyTree]);
}
