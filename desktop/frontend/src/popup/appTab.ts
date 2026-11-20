import type { AppTabSeed } from "../paneTree";
import type { ActionInfo } from "../types";

// Whether a click on the action does something by itself: a command to run, or
// an app to open.
export function runsOnClick(action: ActionInfo): boolean {
  return !!action.cmd || action.type === "app";
}

// The run that opens an action's page in a tab: its app, or its popup's page
// for an action whose click runs a command. Nothing runs, so nothing is asked.
export function appRunOf(action: ActionInfo): ActionInfo {
  return { ...action, type: "app", inputs: undefined, confirm: false, port: undefined };
}

// The tab an action's app opens in, named for the page rather than for a label
// that may be a number its command printed.
export function appTabSeed(action: ActionInfo): AppTabSeed {
  return {
    actionName: action.name,
    label: action.app?.title || action.popup?.title || action.label,
    emoji: action.emoji,
    color: action.color,
  };
}
