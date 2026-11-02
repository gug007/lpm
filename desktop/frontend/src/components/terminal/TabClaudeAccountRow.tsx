import { accountLabel } from "../../claudePoolText";
import { useKnownClaudeAccountsOf } from "../../hooks/useClaudeAccountsOf";
import { useTerminalClaudeAccount } from "../../store/terminalClaudeAccounts";
import { TAB_CARD_KEY as KEY } from "./TabCardRow";

/** The tab card's "Account" row: the Claude login the tab's sessions run as,
 *  with its email when the name doesn't already say it. */
export function TabClaudeAccountRow({ projectName, terminalId }: { projectName: string; terminalId: string }) {
  const machine = useKnownClaudeAccountsOf(projectName);
  const account = useTerminalClaudeAccount(terminalId);
  if (!machine || !account) return null;
  const label = accountLabel(account, machine.pool, machine.accounts);
  const email = machine.statuses[account]?.email;
  return (
    <>
      <span className={KEY}>Account</span>
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        <span className="shrink-0">{label}</span>
        {email && email !== label && <span className={`truncate font-normal ${KEY}`}>· {email}</span>}
      </span>
    </>
  );
}
