import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentMentionComputers } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { computerRows, type ComputerRows, type MentionComputer } from "../computerMentions";

// Computers aren't tied to a cwd, so every composer shares one list, one read
// at a time and one connection listener; the last list seeds a composer's first
// "@" without waiting on the other computers. A change while a read is out
// reads once more after it, since that read may predate the change.
let shared: MentionComputer[] = [];
let reading = false;
let again = false;
let offPeer: (() => void) | null = null;
const listeners = new Set<(list: MentionComputer[]) => void>();

function read() {
  if (listeners.size === 0) return;
  if (reading) {
    again = true;
    return;
  }
  reading = true;
  void AgentMentionComputers()
    .then((list) => {
      shared = list;
      for (const listener of listeners) listener(list);
    })
    .catch(() => {})
    .finally(() => {
      reading = false;
      if (again) {
        again = false;
        read();
      }
    });
}

function subscribe(listener: (list: MentionComputer[]) => void): () => void {
  listeners.add(listener);
  offPeer ??= EventsOn("peer-state-changed", read);
  if (!reading) read();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    offPeer?.();
    offPeer = null;
  };
}

// Sources the "@" menu's other computers while `enabled` (the composer is
// focused and its project runs here: an agent in another computer's project
// runs there, so it gets none). Re-read on `refresh` and whenever a connection
// changes; the shown list stays until a fresh one lands, and an error keeps it.
export function useComputerMentions(enabled: boolean): ComputerRows & { refresh: () => void } {
  const [computers, setComputers] = useState<MentionComputer[]>([]);

  useEffect(() => {
    if (!enabled) {
      setComputers([]);
      return;
    }
    setComputers(shared);
    return subscribe(setComputers);
  }, [enabled]);

  const refresh = useCallback(() => {
    if (enabled) read();
  }, [enabled]);
  const rows = useMemo(() => computerRows(computers), [computers]);
  return { ...rows, refresh };
}
