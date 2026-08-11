import { useCallback, useEffect, useRef, useState } from "react";
import { ListAgentCapabilities } from "../../bridge/commands";
import type { AgentCapabilities } from "../toolkit";

// v0 refreshes when the pane becomes visible and on demand. No watcher yet:
// Claude Code rewrites ~/.claude on nearly every turn, and a strobing list is
// worse than a stale one you can refresh.
export function useToolkitCapabilities(cwd: string, visible: boolean) {
  const [data, setData] = useState<AgentCapabilities | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannedAt, setScannedAt] = useState(0);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = (await ListAgentCapabilities(cwd)) as AgentCapabilities;
      if (mine !== seq.current) return;
      setData(result);
      setError("");
      setScannedAt(Date.now());
    } catch (err) {
      if (mine !== seq.current) return;
      setError(String(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  return { data, error, loading, scannedAt, refresh };
}
