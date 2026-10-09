import { toast } from "sonner";
import { SetClaudeAccountChoice } from "../../bridge/commands";
import { accountLabel } from "../claudePoolText";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import type { ClaudeAccountChoice } from "../types";
import { useAccountsStore } from "./accounts";
import { useAppStore } from "./app";
import { useClaudePoolStore } from "./claudePool";

function choiceText(choice: ClaudeAccountChoice): string {
  switch (choice.kind) {
    case "parent":
      return "its parent's choice";
    case "main":
      return "your main accounts";
    case "pin":
      return choice.id === "" ? "your main login" : accountLabel(choice.id);
    case "list":
      return choice.ids.map((id) => accountLabel(id)).join(", then ");
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
  void useAccountsStore.getState().refreshStatuses();
  void useClaudePoolStore.getState().hydrate();
  toast.success(`New Claude sessions in ${project} use ${choiceText(choice)}`);
  return true;
}

export function openClaudeAccountSettings(): void {
  const { setSettingsTab, setView } = useAppStore.getState();
  setSettingsTab("ai");
  setView("settings");
}
