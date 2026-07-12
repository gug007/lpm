import { useCallback, useEffect, useRef, useState } from "react";
import { rankMentions, type MentionItem } from "../mentions";
import type { RemoteComposerSource } from "../remoteComposerSource";

// Remote counterpart of useMentions: the peer computes the "@" targets (its
// project's files/dirs, with git working-tree changes flagged) since the local
// tree walk would list the wrong machine. Same `{ filter, refresh }` shape so the
// composer swaps only the data source. The remote set has no project/branch/
// service/terminal-log kinds (those are local-only), so ranking runs over the
// flat file pool the peer returns.
export function useRemoteMentions(source: RemoteComposerSource | null, active: boolean) {
  const [pool, setPool] = useState<MentionItem[]>([]);
  const loaded = useRef(false);

  const load = useCallback(() => {
    if (!source) return;
    void source
      .listMentions()
      .then(setPool)
      .catch(() => {
        // Keep the previous list rather than flickering the menu to empty.
      });
  }, [source]);

  useEffect(() => {
    if (!source || !active || loaded.current) return;
    loaded.current = true;
    load();
  }, [source, active, load]);

  const refresh = useCallback(() => {
    if (source && active) load();
  }, [source, active, load]);

  const filter = useCallback((frag: string) => rankMentions(pool, frag), [pool]);

  return { filter, refresh };
}
