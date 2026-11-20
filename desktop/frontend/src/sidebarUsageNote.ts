import type { ProjectClaudeAccounts } from "./hooks/useProjectClaudeAccounts";

export type AccountMark = "tab" | "current" | "next" | "standby";

export interface AccountNote {
  mark: AccountMark;
  text: string;
}

/** What a Claude account's usage row says about the selected project: the
 *  account the tab on screen runs on, the one new sessions use, and the rest
 *  of the pool. While the two differ the row for new sessions reads "new tabs"
 *  rather than "in use", so the tags never claim the tab is somewhere it
 *  isn't. `tabAccount` is null when the tab on screen isn't a Claude one. */
export function accountNote(
  id: string,
  inUse: ProjectClaudeAccounts | null,
  tabAccount: string | null,
  project: string,
): AccountNote | undefined {
  const onTab = id === tabAccount;
  if (id === inUse?.current) {
    if (onTab) {
      return { mark: "current", text: `The tab on screen and new Claude sessions in ${project} use this account` };
    }
    return { mark: tabAccount ? "next" : "current", text: `New Claude sessions in ${project} use this account` };
  }
  if (onTab) return { mark: "tab", text: "The tab on screen uses this account" };
  if (inUse?.standby.includes(id)) return { mark: "standby", text: `${project} can switch to this account` };
  return undefined;
}
