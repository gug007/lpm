import { useCallback, useRef, useState } from "react";
import { ClaudeReadUsage } from "../../bridge/commands";
import type { AgentLimitsMap } from "./useAgentLimits";

/** Readings that moved on between two snapshots. */
export function readingsMoved(before: AgentLimitsMap, after: AgentLimitsMap): boolean {
  return Object.entries(after).some(([key, v]) => (before[key]?.updatedAt ?? 0) < v.updatedAt);
}

const NOTHING_NEW =
  "Nothing new to read. Claude reports usage only when it replies on an account; use Read it now on a card to check one.";

/** "Read it now" per Claude account, and a Refresh that says when it found
 *  nothing new instead of changing nothing. */
export function useUsageReads(limits: AgentLimitsMap, refresh: () => Promise<AgentLimitsMap | undefined>) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(limits);
  latest.current = limits;

  const read = useCallback(async (account: string) => {
    setBusy((b) => ({ ...b, [account]: true }));
    setErrors(({ [account]: _, ...rest }) => rest);
    try {
      await ClaudeReadUsage(account);
    } catch (err) {
      setErrors((e) => ({ ...e, [account]: String(err) }));
    } finally {
      setBusy(({ [account]: _, ...rest }) => rest);
    }
  }, []);

  const refreshAndSay = useCallback(async () => {
    const before = latest.current;
    setNote(null);
    const after = await refresh();
    if (after) setNote(readingsMoved(before, after) ? null : NOTHING_NEW);
  }, [refresh]);

  return { busy, errors, read, note, refresh: refreshAndSay };
}
