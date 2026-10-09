import { useEffect, useState } from "react";
import { ClaudeLimitsAccount } from "../../bridge/commands";
import { MAIN_LOGIN } from "../claudePoolText";
import { projectAccount, projectPool } from "../claudeProjectPool";
import { useAccountsStore } from "../store/accounts";
import { useAppStore } from "../store/app";
import { useClaudePoolStore } from "../store/claudePool";

export interface ProjectClaudeAccounts {
  /** The account new sessions use, as its limits key ("default" is the main login). */
  current: string;
  /** The rest of the project's pool, which it can switch to while switching is on. */
  standby: string[];
}

/** Which Claude account a local project's new sessions run on. Remote projects
 *  run on the far side's login, so they have none here. Pins and pools resolve
 *  from local state, so switching projects never waits on the backend; only
 *  lpm's own login is asked for, once, and it is the same for every project. */
export function useProjectClaudeAccounts(name: string | null): ProjectClaudeAccounts | null {
  const projects = useAppStore((s) => s.projects);
  const pool = useClaudePoolStore((s) => s.pool);
  const accounts = useAccountsStore((s) => s.accounts);
  const [ambient, setAmbient] = useState<string | null>(null);

  const project = name ? projects.find((p) => p.name === name) : undefined;
  const local = project && !project.isRemote ? project : undefined;
  const derived = local
    ? projectAccount(
        local,
        projects,
        pool,
        accounts.map((a) => a.id),
      )
    : null;
  // Before the pool state arrives a pool's account is unknown, and the backend's
  // answer would be that pool's pick rather than lpm's own login.
  const lookup = local && derived === null && pool ? local.name : null;

  useEffect(() => {
    if (!lookup) return;
    let alive = true;
    ClaudeLimitsAccount(lookup)
      .then((id: string) => alive && setAmbient(id || MAIN_LOGIN))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lookup]);

  const current = derived ?? (local && pool ? ambient : null);
  if (!local || !current) return null;
  const view = pool?.active ? projectPool(local, projects, pool) : undefined;
  return {
    current,
    standby: view ? view.members.filter((id) => id !== current) : [],
  };
}
