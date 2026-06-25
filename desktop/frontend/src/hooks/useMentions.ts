import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitChangedFiles, ListBranches, ListDirFiles } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { isDuplicate } from "../types";
import { rankMentions, type MentionItem } from "../mentions";

interface DirFileEntry {
  path: string;
  isDir: boolean;
}

interface ChangedFileEntry {
  path: string;
  status: string;
  staged: boolean;
}

interface BranchEntry {
  name: string;
  committerDate: number;
  remote?: string;
}

// Sources the "@" autocomplete: the live project list (projects + duplicates),
// the target project's running services, and the composer's own terminal — all
// read from in-memory state — a one-shot listing of the terminal's working dir,
// and, when the cwd is a git repo, its working-tree changes and branches. Files
// and branches are fetched once per cwd and cached for the hook's lifetime so
// filtering as the user types never hits the backend; the changed-file set is
// re-read whenever the field regains focus since it tracks the working tree. The
// backend-backed sources are gated by `active` (the composer is focused), so a
// background composer never pays for the walk or a git call.
export function useMentions(
  cwd: string,
  projectName: string,
  terminals: { id: string; label: string }[],
  ownTerminalId: string,
  active: boolean,
) {
  const projects = useAppStore((s) => s.projects);
  const project = useMemo(
    () => projects.find((p) => p.name === projectName),
    [projects, projectName],
  );
  const [files, setFiles] = useState<MentionItem[]>([]);
  const [changed, setChanged] = useState<MentionItem[]>([]);
  const [branches, setBranches] = useState<MentionItem[]>([]);
  const fileCache = useRef(new Map<string, MentionItem[]>());
  const branchCache = useRef(new Map<string, MentionItem[]>());

  useEffect(() => {
    if (!active || !cwd) {
      setFiles([]);
      setChanged([]);
      setBranches([]);
      return;
    }
    // `cancelled` (flipped by the cleanup on any cwd/active change) guards a slow
    // call resolving after it's stale.
    let cancelled = false;

    const cachedFiles = fileCache.current.get(cwd);
    if (cachedFiles) {
      setFiles(cachedFiles);
    } else {
      void (async () => {
        try {
          const list = (await ListDirFiles(cwd)) as DirFileEntry[];
          if (cancelled) return;
          const items: MentionItem[] = list.map((e) => ({
            kind: e.isDir ? "dir" : "file",
            label: e.path,
            insert: e.path,
          }));
          fileCache.current.set(cwd, items);
          setFiles(items);
        } catch {
          if (!cancelled) setFiles([]);
        }
      })();
    }

    const cachedBranches = branchCache.current.get(cwd);
    if (cachedBranches) {
      setBranches(cachedBranches);
    } else {
      void (async () => {
        try {
          const list = (await ListBranches(cwd)) as BranchEntry[];
          if (cancelled) return;
          const seen = new Set<string>();
          const items: MentionItem[] = [];
          for (const b of list) {
            if (seen.has(b.name)) continue;
            seen.add(b.name);
            items.push({ kind: "branch", label: b.name, insert: b.name });
          }
          branchCache.current.set(cwd, items);
          setBranches(items);
        } catch {
          if (!cancelled) setBranches([]);
        }
      })();
    }

    void (async () => {
      try {
        const list = (await GitChangedFiles(cwd)) as ChangedFileEntry[];
        if (cancelled) return;
        setChanged(list.map((e) => ({ kind: "changed", label: e.path, insert: e.path })));
      } catch {
        if (!cancelled) setChanged([]);
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

  // One entry per running service. Only a running project has live tmux panes,
  // and a service's index here is the pane index GetServiceLogs captures by — the
  // same `project.services` list TerminalView streams from, so the two stay
  // aligned. Empty (no rows) when the project is stopped.
  const serviceItems = useMemo<MentionItem[]>(() => {
    const services = project?.running ? (project.services ?? []) : [];
    return services.map((s, i) => ({
      kind: "service-log",
      label: s.name,
      insert: s.name,
      detail: s.cmd,
      paneIndex: i,
    }));
  }, [project]);

  // One entry per terminal tab in the project, each capturing its own xterm
  // scrollback by id at pick time (a background tab's session stays alive, so a
  // sibling's logs are reachable without switching to it). The composer's own
  // terminal is labeled "terminal" — found by typing what you'd expect, with its
  // tab name as detail; the others go by their tab name so they're nameable too.
  const terminalItems = useMemo<MentionItem[]>(
    () =>
      terminals.map((t) => {
        const own = t.id === ownTerminalId;
        return {
          kind: "terminal-log",
          label: own ? "terminal" : t.label,
          insert: own ? "terminal" : t.label,
          detail: own ? t.label || undefined : "terminal output",
          terminalId: t.id,
        };
      }),
    [terminals, ownTerminalId],
  );

  // A changed file is also in the plain file list; keep only the richer "changed"
  // entry so the path isn't offered twice.
  const plainFiles = useMemo(() => {
    const changedPaths = new Set(changed.map((c) => c.insert));
    return files.filter((f) => !changedPaths.has(f.insert));
  }, [changed, files]);

  // The pool the menu ranks; built once per source change rather than per
  // keystroke. rankMentions orders by group, so a source's array position only
  // breaks intra-group ties — branches can ride at the tail of the full pool.
  const basePool = useMemo(
    () => [...changed, ...projectItems, ...terminalItems, ...serviceItems, ...plainFiles],
    [changed, projectItems, terminalItems, serviceItems, plainFiles],
  );
  const fullPool = useMemo(() => [...basePool, ...branches], [basePool, branches]);

  // Branches would flood a bare "@"; surface them only once the user is actually
  // filtering by name. The terminal and services are few, so they ride along on a
  // bare "@" like projects do.
  const filter = useCallback(
    (frag: string) => rankMentions(frag.trim() ? fullPool : basePool, frag),
    [basePool, fullPool],
  );

  return { filter };
}
