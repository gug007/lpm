import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadMemorySessions } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import type { MentionItem } from "../mentions";

export interface MemorySessionInfo {
  title: string;
  updatedAt: number;
  preview: string;
}

const PREVIEW_CHARS = 1200;

// Session list for the composer's "/lpm-memory <session-id>" argument
// completion and the pill's hover preview. Items insert the bare session id
// (the command's argument), not a path. Loaded while the composer is focused,
// kept until the next refresh so the menu never flickers to empty; empty for
// SSH projects (memory files are Mac-local) and unknown projects.
export function useMemorySessions(
  projectName: string,
  active: boolean,
): {
  items: MentionItem[];
  byId: Map<string, MemorySessionInfo>;
  enabled: boolean;
  reload: () => void;
} {
  const projects = useAppStore((s) => s.projects);
  const enabled = useMemo(() => {
    const p = projects.find((pr) => pr.name === projectName);
    return !!p && !p.isRemote;
  }, [projects, projectName]);
  const [items, setItems] = useState<MentionItem[]>([]);
  const [byId, setById] = useState<Map<string, MemorySessionInfo>>(() => new Map());
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    void (async () => {
      try {
        const state = (await ReadMemorySessions(projectName)) as {
          sessions: { name: string; title: string; updatedAt: number; content: string }[];
        };
        setItems(
          state.sessions.map((s) => ({
            kind: "memory",
            label: s.name,
            insert: s.name,
            detail: s.title,
          })),
        );
        setById(
          new Map(
            state.sessions.map((s) => [
              s.name,
              {
                title: s.title,
                updatedAt: s.updatedAt,
                preview: s.content.slice(0, PREVIEW_CHARS),
              },
            ]),
          ),
        );
      } catch {
        // Keep the previous list rather than flickering the menu to empty.
      } finally {
        inFlight.current = false;
      }
    })();
  }, [enabled, projectName]);

  useEffect(() => {
    if (active) load();
    if (!enabled) {
      setItems([]);
      setById(new Map());
    }
  }, [active, enabled, load]);

  return { items, byId, enabled, reload: load };
}
