import { useKnownClaudeAccountsOf } from "../../hooks/useClaudeAccountsOf";
import { UserIcon } from "../icons";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { TabClaudeAccountList } from "./TabClaudeAccountList";

interface TabClaudeAccountSubmenuProps {
  // The project, whose machine's accounts are the ones offered.
  projectName: string;
  terminalId: string;
  working: boolean;
  onPick: (account: string, label: string) => void;
  onClose: () => void;
}

/** "Claude account ▸" on a Claude tab, when its machine has an account besides
 *  the main login. The list and its usage are read only once it opens. */
export function TabClaudeAccountSubmenu(props: TabClaudeAccountSubmenuProps) {
  const machine = useKnownClaudeAccountsOf(props.projectName);
  if (!machine?.accounts.length) return null;
  return (
    <ContextMenuSubmenu label="Claude account" icon={<UserIcon />}>
      <TabClaudeAccountList {...props} />
    </ContextMenuSubmenu>
  );
}
