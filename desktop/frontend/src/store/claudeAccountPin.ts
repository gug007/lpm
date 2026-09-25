import { toast } from "sonner";
import { SetClaudeAccount } from "../../bridge/commands";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import { useAccountsStore } from "./accounts";
import { useAppStore } from "./app";

function accountName(account: string | null): string {
  if (account === null) return "its parent's account";
  if (account === "") return "your main login";
  return useAccountsStore.getState().accounts.find((a) => a.id === account)?.label ?? "that account";
}

// Sessions already running keep the login they started with, so the toast
// speaks of new ones.
export async function pinClaudeAccount(name: string, account: string | null): Promise<void> {
  const project = displayNameForProjectName(name, useAppStore.getState().projects);
  try {
    await SetClaudeAccount(name, account);
  } catch (err) {
    toast.error(`Failed to switch the Claude account for ${project}: ${String(err)}`);
    return;
  }
  void useAccountsStore.getState().refreshStatuses();
  toast.success(`New Claude sessions in ${project} use ${accountName(account)}`);
}

export function openClaudeAccountSettings(): void {
  const { setSettingsTab, setView } = useAppStore.getState();
  setSettingsTab("ai");
  setView("settings");
}
