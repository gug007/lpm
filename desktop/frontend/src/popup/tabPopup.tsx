import { findActionByPath } from "../actionTree";
import type { ActionInfo } from "../types";
import { ActionPopupCard } from "./ActionPopupCard";

// A tab's card opens the moment the pointer reaches the tab, so its popup waits
// this long before running anything.
const TAB_POPUP_DELAY_MS = 400;

// The popup of the action a tab came from, for the bottom of the tab's card.
export function tabPopup(project: { name: string; actions: ActionInfo[] }, actionName: string | undefined) {
  const action = actionName ? findActionByPath(project.actions, actionName) : null;
  if (!action?.popup) return undefined;
  return {
    node: (
      <ActionPopupCard
        project={project.name}
        action={action}
        popup={action.popup}
        open
        delay={TAB_POPUP_DELAY_MS}
      />
    ),
    width: action.popup.width,
  };
}
