import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { followList, type FollowState } from "../followApi";

// Every followed project on this Mac, keyed by the local project the work lands
// in. The backend emits the whole list on `follow-changed` — a follow starting,
// finishing a sync, or pausing — so there is nothing to diff here.
export function useFollowState(): {
  follows: Map<string, FollowState>;
  refresh: () => Promise<void>;
} {
  const [follows, setFollows] = useState<Map<string, FollowState>>(new Map());

  const apply = useCallback((list: FollowState[]) => {
    setFollows(new Map(list.map((f) => [f.project, f])));
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await followList());
    } catch {
      /* an older app shell has no follow commands; leave the list empty */
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      EventsOn("follow-changed", (list: FollowState[]) => {
        if (Array.isArray(list)) apply(list);
      }),
    [apply],
  );

  // A copy that is not known to be a copy renders as a project of its own, so this
  // does not rely on every writer remembering to announce itself. Both events fire
  // when a synced folder appears or goes away, and re-reading the list is cheap.
  useEffect(() => EventsOn("sync-done", () => void refresh()), [refresh]);
  useEffect(() => EventsOn("projects-changed", () => void refresh()), [refresh]);

  return { follows, refresh };
}
