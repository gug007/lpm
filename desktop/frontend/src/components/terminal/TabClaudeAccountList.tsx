import { MAIN_LOGIN, accountLabel } from "../../claudePoolText";
import { useAgentLimits } from "../../hooks/useAgentLimits";
import { useClaudeAccountsOf } from "../../hooks/useClaudeAccountsOf";
import { useNow } from "../../hooks/useNow";
import { peerSlugOf } from "../../peer/markers";
import { accountMeters } from "../../sidebarUsage";
import { useTerminalClaudeAccount } from "../../store/terminalClaudeAccounts";
import { ClaudeAccountMenuRow } from "../ClaudeAccountMenuRow";

interface TabClaudeAccountListProps {
  projectName: string;
  terminalId: string;
  // A turn in progress is interrupted, then carried on on the new account.
  working: boolean;
  onPick: (account: string, label: string) => void;
  onClose: () => void;
}

/** The accounts a Claude tab can continue its conversation on, each with its
 *  5-hour and weekly usage, the one it runs as checked. */
export function TabClaudeAccountList({ projectName, terminalId, working, onPick, onClose }: TabClaudeAccountListProps) {
  const machine = useClaudeAccountsOf(projectName);
  const current = useTerminalClaudeAccount(terminalId);
  const { limits } = useAgentLimits(peerSlugOf(projectName));
  const now = useNow(true, 60000);
  if (!machine) return null;
  const { accounts, statuses, pool } = machine;
  const label = (id: string) => accountLabel(id, pool, accounts);
  const pick = (id: string) => () => {
    if (id !== current) onPick(id, label(id));
    onClose();
  };

  return (
    <div className="w-64">
      <div className="px-3 pb-1 pt-1 text-[10px] text-[var(--text-muted)]">
        {working ? "Interrupt this turn and continue it on" : "Continue this conversation on"}
      </div>
      {[MAIN_LOGIN, ...accounts.map((a) => a.id)].map((id) => {
        const signedIn = statuses[id]?.signedIn !== false;
        const isCurrent = id === current;
        return (
          <ClaudeAccountMenuRow
            key={id}
            label={label(id)}
            signedIn={signedIn}
            meters={accountMeters(limits, id, now)}
            current={isCurrent}
            disabled={!isCurrent && !signedIn}
            onClick={pick(id)}
          />
        );
      })}
    </div>
  );
}
