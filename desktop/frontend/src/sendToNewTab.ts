import { isImagePath, quoteImagePathForPaste } from "./composerValue";
import { splitByImageTokens } from "./components/composerEditor";
import { loadNewTabMemory, modelsOf } from "./newTabPick";
import type { RemoteAgentLaunch } from "./remoteAgentTabs";
import type { SendTargetRow } from "./sendTargets";
import { useAppStore } from "./store/app";
import { shellQuote } from "./terminal-io";
import { AI_CLI_OPTIONS, type AICLI } from "./types";

// The agent a prompt sent to a new tab starts: the one it was written for, else
// Claude, with the model and level last picked for it in the + popup.
export function newTabAgent(sourceAgent: string): { launch: RemoteAgentLaunch; label: string; detail: string } {
  const cli = AI_CLI_OPTIONS.find((o) => o.value === sourceAgent) ?? AI_CLI_OPTIONS[0];
  const pick = loadNewTabMemory()[cli.value as AICLI];
  const model = modelsOf(cli.value).find((m) => m.value === pick.model && m.value !== "");
  return {
    launch: { agent: cli.value, model: pick.model, effort: pick.effort },
    label: `New ${cli.label} tab`,
    detail: model?.label ?? "",
  };
}

// The prompt as an agent starting with it reads it: each image chip becomes
// its file's path, quoted the way a paste would bring it.
export function promptWithImagePaths(text: string, images: Record<string, string>): string {
  return splitByImageTokens(text)
    .map((s) => {
      const path = s.image === null ? undefined : images[s.image];
      if (path === undefined) return s.text;
      return ` ${isImagePath(path) ? quoteImagePathForPaste(path) : shellQuote(path)} `;
    })
    .join("")
    .trim();
}

// Opens the agent in a new tab of `projectName`, behind whatever that project
// shows, the way a phone's New Tab does; the project need not be open.
export function startPromptInNewTab(
  projectName: string,
  launch: RemoteAgentLaunch,
  text: string,
  images: Record<string, string>,
): void {
  useAppStore
    .getState()
    .triggerRemoteAction(projectName, null, undefined, undefined, {
      agent: { ...launch, prompt: promptWithImagePaths(text, images) },
    });
}

export function sentToastText(row: SendTargetRow, mode: "send" | "move"): string {
  if (row.launch) return `Started a new tab in ${row.projectLabel}`;
  return mode === "move" ? `Moved to ${row.label}` : `Sent to ${row.label}`;
}

export function openSentTarget(row: SendTargetRow): void {
  const app = useAppStore.getState();
  if (row.launch) app.selectProject(row.projectName);
  else app.focusProjectTerminal(row.projectName, row.terminalId);
}
