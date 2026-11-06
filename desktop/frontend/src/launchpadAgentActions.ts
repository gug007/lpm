import { forEachAction } from "./actionTree";
import { providerMeta } from "./agentStatus";
import { isSplitButton, loadRememberedChild, resolvePrimaryChild } from "./components/splitPrimary";
import { detectAICLI, findAICLI } from "./slashCommands";
import { AI_CLI_OPTIONS, type ActionInfo, type AICLI } from "./types";

// Something the launchpad can start with its prompt: a project action that
// opens an agent CLI (and the split button or menu it sits in), or a bare
// agent CLI when the project has none.
export interface LaunchpadOption {
  id: string;
  label: string;
  emoji?: string;
  agent: AICLI;
  action?: ActionInfo;
  group?: ActionInfo;
}

// One tab in the launchpad's row: a single option, or a header split button
// or menu holding several.
export interface LaunchpadTab {
  key: string;
  label: string;
  emoji?: string;
  options: LaunchpadOption[];
  // What the tab's main part picks; null for a menu, which only opens.
  primary: LaunchpadOption | null;
}

const SHELL_WORD = /(?:[^\s;&|"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+|[;&|]+/g;
const QUOTED_TASK = /^(["']).*\s.*\1$/s;

// Whether the agent an action opens starts on a task of its own: a saved
// prompt, or a quoted multi-word argument after the agent's command word that
// isn't a flag's value (`claude "Review my changes"`).
export function startsOwnTask(action: Pick<ActionInfo, "cmd" | "prompt">): boolean {
  if (action.prompt?.trim()) return true;
  const found = findAICLI(action.cmd);
  if (!found) return false;
  const words = action.cmd.slice(found.end).match(SHELL_WORD) ?? [];
  for (const [i, word] of words.entries()) {
    if (/^[;&|]/.test(word)) return false;
    if (QUOTED_TASK.test(word) && !words[i - 1]?.startsWith("-")) return true;
  }
  return false;
}

function agentOption(action: ActionInfo, group: ActionInfo | undefined, skipOwnTasks: boolean): LaunchpadOption | null {
  const agent = action.type === "terminal" ? detectAICLI(action.cmd) : null;
  if (!agent || (skipOwnTasks && startsOwnTask(action))) return null;
  return { id: action.name, label: action.label || action.name, emoji: action.emoji, agent, action, group };
}

function singleTab(option: LaunchpadOption): LaunchpadTab {
  return { key: option.id, label: option.label, options: [option], primary: option };
}

// The project's header actions that open an agent CLI, split buttons and menus
// kept whole with only their agent items, each split led by the item the
// header's button would run (its last used one, when it remembers that). The
// bare CLIs when the project has none. `skipOwnTasks` leaves out the actions
// that start their agent on a task of their own, for a prompt that is the task.
export function launchpadTabs(
  actions: ActionInfo[],
  scope: string,
  { skipOwnTasks = false }: { skipOwnTasks?: boolean } = {},
): LaunchpadTab[] {
  const tabs: LaunchpadTab[] = [];
  for (const action of actions) {
    const own = agentOption(action, undefined, skipOwnTasks);
    const children: LaunchpadOption[] = [];
    forEachAction(action.children ?? [], (child) => {
      const option = agentOption(child, action, skipOwnTasks);
      if (option) children.push(option);
    });
    if (children.length === 0) {
      if (own) tabs.push(singleTab(own));
      continue;
    }
    const options = own ? [own, ...children] : children;
    const lead = resolvePrimaryChild(action, loadRememberedChild(scope, action.name));
    const primary = options.find((o) => o.id === lead?.name) ?? (isSplitButton(action, lead) ? options[0] : null);
    tabs.push({ key: action.name, label: action.label || action.name, emoji: action.emoji, options, primary });
  }
  if (tabs.length > 0) return tabs;
  return AI_CLI_OPTIONS.map((o) => singleTab({ id: o.value, label: providerMeta(o.value).short, agent: o.value }));
}

const KEY = "lpm:launchpad:action:v1";

// What the launchpad last started (an option's id or "terminal"), remembered
// on this computer.
export function loadLaunchpadAction(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveLaunchpadAction(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* a convenience only */
  }
}
