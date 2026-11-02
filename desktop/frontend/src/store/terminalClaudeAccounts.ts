import { useEffect } from "react";
import { create } from "zustand";
import { TerminalClaudeAccount } from "../../bridge/commands";

// The Claude account each terminal was started for, by terminal id; null for
// one that has none (an SSH project's). A terminal keeps its account for life
// (moving a tab to another account starts a new terminal), so each id is asked
// once, again only after a failed ask.
interface TerminalClaudeAccountsState {
  accounts: Record<string, string | null>;
  load: (terminalId: string) => void;
}

const asking = new Set<string>();

export const useTerminalClaudeAccounts = create<TerminalClaudeAccountsState>((set, get) => ({
  accounts: {},
  load: (terminalId) => {
    if (terminalId in get().accounts || asking.has(terminalId)) return;
    asking.add(terminalId);
    TerminalClaudeAccount(terminalId)
      .then((account) => set((s) => ({ accounts: { ...s.accounts, [terminalId]: account || null } })))
      .catch(() => {})
      .finally(() => asking.delete(terminalId));
  },
}));

// The account a terminal's Claude sessions run as; undefined until known, and
// for a terminal that has none.
export function useTerminalClaudeAccount(terminalId: string): string | undefined {
  const account = useTerminalClaudeAccounts((s) => s.accounts[terminalId]);
  const load = useTerminalClaudeAccounts((s) => s.load);
  useEffect(() => load(terminalId), [terminalId, load]);
  return account ?? undefined;
}
