import { useEffect, useMemo, useState } from "react";
import { ClaudeLimitsAccount, TerminalClaudeAccount } from "../../bridge/commands";
import { useAgentLimits } from "./useAgentLimits";
import { limitResetFor, limitsEntryFor, type LimitAgent, type LimitReset } from "../sendLater/limitReset";

// When this terminal's agent can work again, for the "limit resets" pick. Mount
// it only while that pick can be shown: it reads the live limits as it goes.
// The terminal's own account wins: with account switching, the project's next
// session may run elsewhere.
export function useLimitReset(
  projectName: string,
  agent: LimitAgent | null,
  now: number,
  terminalId?: string,
): LimitReset | null {
  const { limits } = useAgentLimits();
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    if (agent !== "claude") return;
    let alive = true;
    const own = terminalId ? TerminalClaudeAccount(terminalId).catch(() => null) : Promise.resolve(null);
    own
      .then((id) => id || ClaudeLimitsAccount(projectName))
      .then((id: string) => alive && setAccount(id || "default"))
      .catch(() => alive && setAccount("default"));
    return () => {
      alive = false;
    };
  }, [projectName, agent, terminalId]);

  return useMemo(() => {
    if (!agent || (agent === "claude" && account === null)) return null;
    return limitResetFor(limitsEntryFor(limits, agent, account ?? "default"), agent, now);
  }, [limits, agent, account, now]);
}
