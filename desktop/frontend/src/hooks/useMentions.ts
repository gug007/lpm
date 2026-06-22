import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListDirFiles } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { isDuplicate } from "../types";
import { rankMentions, type MentionItem } from "../mentions";

interface DirFileEntry {
  path: string;
  isDir: boolean;
}

// Sources the "@" autocomplete: the live project list (projects + duplicates,
// read from the in-memory store) plus a one-shot listing of the terminal's
// working dir. The file list is fetched once per cwd and cached for the hook's
// lifetime, so filtering as the user types never hits the backend. Gated by
// `active` (the composer is focused and the terminal runs an agent), so a plain
// shell never pays for a tree walk.
export function useMentions(cwd: string, active: boolean) {
  const projects = useAppStore((s) => s.projects);
  const [files, setFiles] = useState<MentionItem[]>([]);
  const cache = useRef(new Map<string, MentionItem[]>());

  useEffect(() => {
    if (!active || !cwd) {
      setFiles([]);
      return;
    }
    const cached = cache.current.get(cwd);
    if (cached) {
      setFiles(cached);
      return;
    }
    // `cancelled` (flipped by the cleanup on any cwd/active change) guards a slow
    // walk resolving after it's stale.
    let cancelled = false;
    (async () => {
      try {
        const list = (await ListDirFiles(cwd)) as DirFileEntry[];
        if (cancelled) return;
        const items: MentionItem[] = list.map((e) => ({
          kind: e.isDir ? "dir" : "file",
          label: e.path,
          insert: e.path,
        }));
        cache.current.set(cwd, items);
        setFiles(items);
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, active]);

  const projectItems = useMemo<MentionItem[]>(() => {
    const present = new Set(projects.map((p) => p.name));
    return projects.map((p) => ({
      kind: isDuplicate(p, present) ? "duplicate" : "project",
      label: p.label || p.name,
      insert: p.root,
      detail: p.root,
    }));
  }, [projects]);

  const filter = useCallback(
    (frag: string) => rankMentions(projectItems, files, frag),
    [projectItems, files],
  );

  return { filter };
}
