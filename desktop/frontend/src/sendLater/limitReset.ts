import type { AgentLimitsMap, LimitWindow, ProviderLimits } from "../hooks/useAgentLimits";

export type LimitAgent = "claude" | "codex";

export interface LimitReset {
  // When a prompt set for the reset goes out: just after it, so the first
  // request lands in the fresh window.
  at: number;
  resetsAt: number;
  usedPercent: number;
  agent: string;
  window: "5-hour" | "weekly";
}

const AFTER_RESET_MS = 30_000;

function live(win: LimitWindow | undefined, now: number): LimitWindow | undefined {
  return win && win.resetsAt > 0 && win.resetsAt * 1000 > now ? win : undefined;
}

// The readings for the account this terminal's agent runs as. Codex keeps one
// reading per Mac; Claude one per login.
export function limitsEntryFor(
  limits: AgentLimitsMap,
  agent: LimitAgent,
  claudeAccount: string,
): ProviderLimits | undefined {
  if (agent === "codex") return limits.codex;
  return (
    limits[`claude:${claudeAccount}`] ??
    Object.values(limits).find(
      (v) => v.provider === "claude" && (v.accountId || "default") === claudeAccount,
    )
  );
}

// When the limit holding this agent back resets. A used-up window decides it —
// the weekly one can be what blocks — otherwise the 5-hour window does. Null
// when there's no live reading to go by.
export function limitResetFor(
  entry: ProviderLimits | undefined,
  agent: LimitAgent,
  now: number,
): LimitReset | null {
  if (!entry || entry.noLimits) return null;
  const windows: [LimitReset["window"], LimitWindow][] = [];
  const five = live(entry.fiveHour, now);
  const weekly = live(entry.weekly, now);
  if (five) windows.push(["5-hour", five]);
  if (weekly) windows.push(["weekly", weekly]);
  const exhausted = windows.filter(([, w]) => w.usedPercent >= 100);
  const pick = exhausted.length
    ? exhausted.reduce((a, b) => (b[1].resetsAt > a[1].resetsAt ? b : a))
    : windows.find(([name]) => name === "5-hour");
  if (!pick) return null;
  const [window, win] = pick;
  return {
    at: win.resetsAt * 1000 + AFTER_RESET_MS,
    resetsAt: win.resetsAt * 1000,
    usedPercent: win.usedPercent,
    agent: agent === "claude" ? "Claude" : "Codex",
    window,
  };
}
