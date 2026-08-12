import { useCallback, useEffect, useRef, useState } from "react";
import { AgentUsageStats } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { AgentUsageStats as AgentUsageStatsData } from "../types";

// The backend prunes today's scan by file mtime, so a refresh only parses the
// sessions that actually ran — cheap enough to repeat while the app is open,
// but not cheap enough to run on every keystroke of agent output.
const POLL_MS = 3 * 60 * 1000;
const EVENT_THROTTLE_MS = 30 * 1000;

export interface TokensTodayState {
  stats: AgentUsageStatsData | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

/** Today's token spend across the agent CLIs. `enabled` is false wherever the
 *  user has turned the display off, so nothing is scanned for a hidden view. */
export function useTokensToday(enabled = true): TokensTodayState {
  const [stats, setStats] = useState<AgentUsageStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const token = useRef(0);
  const lastRun = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++token.current;
    const current = () => alive.current && mine === token.current;
    lastRun.current = Date.now();
    setLoading(true);
    try {
      const next = (await AgentUsageStats(1)) as AgentUsageStatsData;
      if (current()) {
        setStats(next ?? null);
        setError("");
      }
    } catch (cause) {
      if (current()) setError(String(cause));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    // A limits push means an agent just reported work, which is the closest
    // thing to a "tokens changed" signal the app gets.
    const off = EventsOn("agent-limits-changed", () => {
      if (Date.now() - lastRun.current >= EVENT_THROTTLE_MS) void refresh();
    });
    return () => {
      window.clearInterval(timer);
      if (typeof off === "function") off();
    };
  }, [enabled, refresh]);

  return { stats, loading, error, refresh };
}
