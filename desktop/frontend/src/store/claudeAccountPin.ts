import { toast } from "../notifications/toast";
import { SetClaudeAccountChoice } from "../../bridge/commands";
import { accountLabel } from "../claudePoolText";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import { peerSlugOf } from "../peer/markers";
import type { ClaudeAccount, ClaudeAccountChoice } from "../types";
import { useAccountsStore } from "./accounts";
import { useAppStore } from "./app";
import { useClaudePoolStore } from "./claudePool";
import { useMachineClaudeStore } from "./machineClaude";

// `accounts` are the project's machine's, when that isn't this Mac.
function choiceText(choice: ClaudeAccountChoice, accounts?: ClaudeAccount[]): string {
  switch (choice.kind) {
    case "parent":
      return "its parent's choice";
    case "main":
      return "your main accounts";
    case "pin":
      return choice.id === "" ? "your main login" : accountLabel(choice.id, null, accounts);
    case "list":
      return choice.ids.map((id) => accountLabel(id, null, accounts)).join(", then ");
  }
}

// Sessions already running keep the login they started with, so the toast
// speaks of new ones.
export async function setClaudeAccountChoice(name: string, choice: ClaudeAccountChoice): Promise<boolean> {
  const project = displayNameForProjectName(name, useAppStore.getState().projects);
  try {
    await SetClaudeAccountChoice(name, choice);
  } catch (err) {
    toast.error(`Failed to change the Claude account for ${project}: ${String(err)}`);
    return false;
  }
  const machine = peerSlugOf(name);
  let accounts: ClaudeAccount[] | undefined;
  if (machine) {
    const found = await useMachineClaudeStore.getState().load(machine).catch(() => null);
    accounts = found?.accounts;
  } else {
    void useAccountsStore.getState().refreshStatuses();
    void useClaudePoolStore.getState().hydrate();
  }
  toast.success(`New Claude sessions in ${project} use ${choiceText(choice, accounts)}`);
  return true;
}

// The accounts of this Mac, or of the paired machine `machine`.
export function openClaudeAccountSettings(machine: string | null = null): void {
  const { setSettingsTab, setView, openMachineSettings } = useAppStore.getState();
  if (machine) openMachineSettings(machine);
  else setView("settings");
  setSettingsTab("accounts");
}
