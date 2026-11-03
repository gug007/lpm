import { forEachAction } from "./actionTree";
import type { AgentSessionProvider } from "./agentSession";
import { mergeSessionRows } from "./agentSessions";
import type { TerminalViewHandle } from "./components/TerminalView";
import type { TerminalStartOpts } from "./hooks/terminals/types";
import { findAICLI } from "./slashCommands";
import { getProjectTerminals } from "./terminals";
import { AI_CLI_OPTIONS, aiEfforts, type ActionInfo, type AICLI } from "./types";

// A phone's New Tab sheet asked for an agent, with the model, level and first
// prompt picked there ("" = the agent's own default).
export interface RemoteAgentLaunch {
  agent: string;
  model?: string;
  effort?: string;
  prompt?: string;
}

// A phone picked a past conversation to continue, named as its list showed it.
export interface RemoteResume {
  provider: string;
  sessionId: string;
  title?: string;
}

export interface RemoteTabRequest {
  agent?: RemoteAgentLaunch;
  resume?: RemoteResume;
  // The first prompt for the agent a phone's action run opens.
  prompt?: string;
  // Asked for at this Mac: put the project and its new tab on screen.
  focus?: boolean;
}

// What the phone's New Tab sheet offers: the agents and models the desktop's
// launch picker lists, each model with the levels it takes.
export function agentOptionsForRemote() {
  return AI_CLI_OPTIONS.map((cli) => ({
    id: cli.value,
    label: cli.label,
    models: (cli.models ?? []).map((model) => ({
      value: model.value,
      label: model.label,
      efforts: aiEfforts(cli.value, model.value).map(({ value, label }) => ({ value, label })),
    })),
  }));
}

// The project's own button for starting `cli`, when a new tab can run it as
// is: a terminal action that asks nothing and carries no task of its own.
export function agentLaunchAction(actions: ActionInfo[], cli: AICLI): ActionInfo | null {
  let found: ActionInfo | null = null;
  forEachAction(actions, (action) => {
    if (found || action.type !== "terminal" || action.children?.length) return;
    if (action.inputs?.length || action.prompt) return;
    if (findAICLI(action.cmd)?.cli === cli) found = action;
  });
  return found;
}

// The tab that opens an agent: the project's own button for it when there is
// one, else the CLI itself, pinned to the picked model and level. Null for an
// agent this Mac doesn't offer.
export function agentTabCommand(
  actions: ActionInfo[],
  launch: RemoteAgentLaunch,
): { label: string; cmd: string; opts: TerminalStartOpts } | null {
  const cli = AI_CLI_OPTIONS.find((o) => o.value === launch.agent);
  if (!cli) return null;
  const launchModel = { model: launch.model ?? "", effort: launch.effort ?? "" };
  const prompt = launch.prompt?.trim() || undefined;
  const action = agentLaunchAction(actions, cli.value);
  if (action) {
    return {
      label: action.label,
      cmd: action.cmd,
      opts: {
        configName: action.name,
        actionName: action.name,
        emoji: action.emoji,
        color: action.color,
        prompt,
        launchModel,
      },
    };
  }
  return { label: cli.label, cmd: cli.value, opts: { prompt, launchModel } };
}

// Opens the agent a phone asked for behind whatever this Mac shows.
export function launchRemoteAgent(
  view: TerminalViewHandle | null,
  actions: ActionInfo[],
  launch: RemoteAgentLaunch,
  background = true,
): void {
  if (!view) return;
  const tab = agentTabCommand(actions, launch);
  if (!tab) {
    view.createTerminal(background);
    return;
  }
  view.createTerminalWithCmd(tab.label, tab.cmd, { ...tab.opts, background });
}

function isProvider(value: string): value is AgentSessionProvider {
  return value === "claude" || value === "codex";
}

// Continues the conversation exactly as picking it in Resume session does —
// the tab history's own command and name when this project closed it — unless
// a tab already holds it, which the phone opens instead.
export function resumeRemoteSession(
  view: TerminalViewHandle | null,
  projectName: string,
  resume: RemoteResume,
): void {
  if (!view || !isProvider(resume.provider)) return;
  const row = mergeSessionRows({
    history: getProjectTerminals(projectName).history ?? [],
    sessions: [
      { provider: resume.provider, sessionId: resume.sessionId, title: resume.title, updatedAt: 0 },
    ],
    open: view.liveAgentSessions(),
    search: "",
  }).find((r) => r.storeBacked && r.sessionId === resume.sessionId);
  if (!row || row.openInTerminalId) return;
  view.resumeFromHistory(
    {
      label: row.label,
      sessionTitle: row.title,
      sessionTitleId: row.sessionTitleId,
      sessionTitleSource: row.sessionTitleSource,
      resumeCmd: row.resumeCmd,
      actionName: row.actionName,
      closedAt: row.updatedAt,
    },
    true,
  );
}
