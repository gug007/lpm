import { useEffect, useMemo, useState } from "react";
import { ClaudeLimitsAccount } from "../../bridge/commands";
import { useAgentLimits } from "./useAgentLimits";
import { limitResetFor, limitsEntryFor, type LimitAgent, type LimitReset } from "../sendLater/limitReset";

// When this terminal's agent can work again, for the "limit resets" pick. Mount
// it only while that pick can be shown: it reads the live limits as it goes.
export function useLimitReset(projectName: string, agent: LimitAgent | null, now: number): LimitReset | null {
  const { limits } = useAgentLimits();
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    if (agent !== "claude") return;
    let alive = true;
    ClaudeLimitsAccount(projectName)
      .then((id: string) => alive && setAccount(id || "default"))
      .catch(() => alive && setAccount("default"));
    return () => {
      alive = false;
    };
  }, [projectName, agent]);

  return useMemo(() => {
    if (!agent || (agent === "claude" && account === null)) return null;
    return limitResetFor(limitsEntryFor(limits, agent, account ?? "default"), agent, now);
  }, [limits, agent, account, now]);
}
