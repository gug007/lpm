import { useCallback, useEffect, useRef, useState } from "react";
import type { SlashCommand } from "../slashCommands";
import type { RemoteComposerSource } from "../remoteComposerSource";

// Remote counterpart of useSlashCommands: the peer computes the terminal's
// slash-command list (against its own CLI + project), fetched once on activation
// and filtered client-side. Same return shape so the composer swaps only the data
// source. `enabled` is true once the peer returns any commands (i.e. the terminal
// runs a known agent) — it gates the menu the way a non-null CLI does locally.
export function useRemoteSlashCommands(source: RemoteComposerSource | null, active: boolean) {
  const [all, setAll] = useState<SlashCommand[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!source || !active || loaded.current) return;
    loaded.current = true;
    let cancelled = false;
    void source
      .listSlashCommands()
      .then((list) => {
        if (!cancelled) setAll(list);
      })
      .catch(() => {
        if (!cancelled) setAll([]);
      });
    return () => {
      cancelled = true;
    };
  }, [source, active]);

  const filter = useCallback(
    (frag: string): SlashCommand[] => {
      const q = frag.toLowerCase();
      if (!q) return all;
      const starts: SlashCommand[] = [];
      const contains: SlashCommand[] = [];
      for (const c of all) {
        const name = c.name.toLowerCase();
        if (name.startsWith(q)) starts.push(c);
        else if (name.includes(q) || c.description.toLowerCase().includes(q)) contains.push(c);
      }
      return starts.concat(contains);
    },
    [all],
  );

  const isCommand = useCallback((name: string) => all.some((c) => c.name === name), [all]);

  const argumentHintFor = useCallback(
    (name: string) => all.find((c) => c.name === name)?.argumentHint ?? "",
    [all],
  );

  return { filter, isCommand, argumentHintFor, enabled: all.length > 0 };
}
