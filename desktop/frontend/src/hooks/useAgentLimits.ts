import { useCallback, useEffect, useRef, useState } from "react";
import { AgentLimits } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

export interface LimitWindow {
  usedPercent: number;
  resetsAt: number; // unix seconds; 0 when unknown
}

export interface ProviderLimits {
  provider: "claude" | "codex" | string;
  accountId?: string;
  label?: string;
  fiveHour?: LimitWindow;
  weekly?: LimitWindow;
  updatedAt: number; // unix millis
}

export type AgentLimitsMap = Record<string, ProviderLimits>;

export interface AgentLimitsState {
  limits: AgentLimitsMap;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

// Initial fetch of the current snapshot, kept live by the backend's
// `agent-limits-changed` event (Codex file watcher + Claude statusline forwarder).
export function useAgentLimits(): AgentLimitsState {
  const [limits, setLimits] = useState<AgentLimitsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  // A push event carries a newer snapshot than any in-flight fetch, so bumping
  // the token retires that fetch instead of letting its older reading land last.
  const token = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++token.current;
    const current = () => alive.current && mine === token.current;
    setLoading(true);
    setError("");
    try {
      const m = await AgentLimits();
      if (current()) setLimits((m ?? {}) as AgentLimitsMap);
    } catch (err) {
      if (current()) setError(String(err));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = EventsOn("agent-limits-changed", (m) => {
      token.current += 1;
      setLimits((m ?? {}) as AgentLimitsMap);
      setLoading(false);
      setError("");
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [refresh]);

  return { limits, loading, error, refresh };
}

// Codex reports one snapshot; Claude reports one per account, so pick the
// most-recently-updated Claude entry for the compact sidebar row.
export function pickProvider(
  map: AgentLimitsMap,
  provider: "claude" | "codex",
): ProviderLimits | undefined {
  let best: ProviderLimits | undefined;
  for (const v of Object.values(map)) {
    if (v.provider !== provider) continue;
    if (!best || v.updatedAt > best.updatedAt) best = v;
  }
  return best;
}
