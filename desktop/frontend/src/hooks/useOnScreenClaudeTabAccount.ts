import { useProjectClaudeTabs } from "../store/projectClaudeTabs";
import { useTerminalClaudeAccount } from "../store/terminalClaudeAccounts";
import { useTerminalTitles } from "../store/terminalTitles";

/** The Claude account the tab on screen runs as, by its limits key ("default"
 *  is the main login): the project's focused tab, while its terminals are in
 *  view and that tab runs Claude. Null otherwise, and until the account is
 *  known. */
export function useOnScreenClaudeTabAccount(project: string | null): string | null {
  const onScreen = useTerminalTitles((s) => (project ? s.onScreenByProject[project] ?? null : null));
  const claudeTab = useProjectClaudeTabs((s) => (project ? s.byProject[project]?.selected ?? null : null));
  return useTerminalClaudeAccount(onScreen !== null && onScreen === claudeTab ? onScreen : null) ?? null;
}
