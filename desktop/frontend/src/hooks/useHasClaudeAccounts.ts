import { peerSlugOf } from "../peer/markers";
import { useAccountsStore } from "../store/accounts";
import { useMachineClaudeStore } from "../store/machineClaude";

// Whether the machine a project runs on has a Claude account besides its main
// login: this Mac, or the paired machine the project is on (read when it
// connected).
export function useHasClaudeAccounts(projectName: string): boolean {
  const slug = peerSlugOf(projectName);
  const local = useAccountsStore((s) => s.accounts.length > 0);
  const remote = useMachineClaudeStore((s) => (slug ? (s.machines[slug]?.accounts.length ?? 0) > 0 : false));
  return slug ? remote : local;
}
