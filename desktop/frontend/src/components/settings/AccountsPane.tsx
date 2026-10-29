import { useEffect } from "react";
import { useAccountsStore } from "../../store/accounts";
import { ClaudeAccountsSection } from "../ClaudeAccountsSection";
import { useRowReach, useSettingsTarget } from "./settingsTarget";
import { UsageLimitsSection } from "./UsageLimitsSection";
import { useClaudeAccountsSource } from "./useClaudeAccountsSource";

// Settings › Accounts & usage: the accounts agents run on, switching between
// them before a limit, and how much of each plan is gone.
export function AccountsPane() {
  const shows = useRowReach();
  const { machine } = useSettingsTarget();
  const host = machine.kind === "peer" ? machine.slug : null;
  const accounts = useClaudeAccountsSource(host);
  const refreshAccountStatuses = useAccountsStore((s) => s.refreshStatuses);

  useEffect(() => {
    if (!host) void refreshAccountStatuses();
  }, [host, refreshAccountStatuses]);

  return (
    <>
      {shows("ai.accounts") && accounts && <ClaudeAccountsSection source={accounts} />}
      <UsageLimitsSection />
    </>
  );
}
