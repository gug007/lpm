import { noteChildRun } from "./components/splitPrimary";
import {
  launchpadTabs,
  loadLaunchpadAction,
  type LaunchpadOption,
  type LaunchpadTab,
} from "./launchpadAgentActions";
import { newTabAgent, startPromptInNewTab } from "./sendToNewTab";
import { useAppStore } from "./store/app";

const KEY = "lpm:ci-fix:option:v1";

interface FixPick {
  id: string;
  agent: string;
}

function loadFixPick(): FixPick | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FixPick) : null;
  } catch {
    return null;
  }
}

function saveFixPick(option: LaunchpadOption): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ id: option.id, agent: option.agent }));
  } catch {
    /* a convenience only */
  }
}

/** What can fix a project's failing checks: the agents its empty launchpad
 *  offers, split buttons and menus kept whole, less the actions that start on a
 *  task of their own. */
export function fixTabs(projectName: string): LaunchpadTab[] {
  const project = useAppStore.getState().projects.find((p) => p.name === projectName);
  return launchpadTabs(project?.actions ?? [], projectName, { skipOwnTasks: true });
}

/** The agent a one-click fix starts: the one last used for a fix (the same
 *  agent when this project lacks that action), else the launchpad's last pick,
 *  else the first one offered. */
export function preferredFixOption(tabs: LaunchpadTab[]): LaunchpadOption | null {
  const all = tabs.flatMap((t) => t.options);
  const leads = tabs.map((t) => t.primary ?? t.options[0]);
  const last = loadFixPick();
  const launchpad = loadLaunchpadAction();
  return (
    (last && all.find((o) => o.id === last.id)) ||
    (last && (leads.find((o) => o.agent === last.agent) ?? all.find((o) => o.agent === last.agent))) ||
    all.find((o) => o.id === launchpad) ||
    leads[0] ||
    null
  );
}

/** Starts `option` in a new tab of `projectName` with `prompt` as its first
 *  message, and brings the project and that tab on screen. An action that asks
 *  for inputs or a confirmation asks them first. */
export function startFix(projectName: string, option: LaunchpadOption, prompt: string): void {
  saveFixPick(option);
  const { action, group } = option;
  if (!action) {
    startPromptInNewTab(projectName, newTabAgent(option.agent).launch, prompt, {}, true);
    return;
  }
  if (group) noteChildRun(projectName, group, action);
  const asks = !!action.inputs?.length || !!action.confirm;
  useAppStore
    .getState()
    .triggerRemoteAction(projectName, action.name, asks ? undefined : {}, !asks, { prompt, focus: true });
}
