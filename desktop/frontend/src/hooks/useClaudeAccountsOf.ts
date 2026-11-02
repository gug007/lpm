import { useEffect, useMemo } from "react";
import type { MachineClaudeAccounts } from "../peer/hostClaude";
import { peerSlugOf } from "../peer/markers";
import { useAccountsStore } from "../store/accounts";
import { useClaudePoolStore } from "../store/claudePool";
import { useMachineClaudeStore } from "../store/machineClaude";

// The Claude accounts a project's sessions can use: this Mac's, or those of the
// paired machine it is on. Null while a machine's are loading, or from one too
// old to share them.
export function useClaudeAccountsOf(projectName: string | null): MachineClaudeAccounts | null {
  const slug = peerSlugOf(projectName);
  const load = useMachineClaudeStore((s) => s.load);

  useEffect(() => {
    if (slug) load(slug).catch(() => {});
  }, [slug, load]);

  return useKnownClaudeAccountsOf(projectName);
}

// The same, as already read: a paired machine isn't asked again, which suits
// views shown often, like a tab's hover card.
export function useKnownClaudeAccountsOf(projectName: string | null): MachineClaudeAccounts | null {
  const slug = peerSlugOf(projectName);
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const usage = useAccountsStore((s) => s.usage);
  const pool = useClaudePoolStore((s) => s.pool);
  const host = useMachineClaudeStore((s) => (slug ? s.machines[slug] : undefined)) ?? null;

  const local = useMemo(() => ({ accounts, statuses, usage, pool }), [accounts, statuses, usage, pool]);
  return slug ? host : local;
}
