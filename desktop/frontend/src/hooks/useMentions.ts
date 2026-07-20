import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitChangedFiles, ListBranches, ListDirFiles } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { isDuplicate } from "../types";
import { rankMentions, type MentionItem } from "../mentions";
import { findParentProject, projectDisplayName } from "../components/ProjectNameDisplay";

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
// read from in-memory state — a listing of the terminal's working dir, and, when
// the cwd is a git repo, its working-tree changes and branches. The backend-backed
// sources are re-read each time the editor regains focus (via the returned
// `refresh`), so files, branches, and working-tree changes edited outside the app
// surface without remounting the tab; files and branches keep their previous list
// until the fresh one lands (no flicker to empty) while the changed-file set,
// which tracks the working tree most closely, is always re-read. A per-cwd cache
// seeds the initial list on activation so a first "@" never waits on the backend.
// Every backend source is gated by `active` (the composer is focused), so a
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
  // Bumped on every cwd/active change; a fetch tags itself with the value live
  // when it started and drops its result once the stamp has moved on (the
  // successor to the old `cancelled` cleanup flag, but one that also invalidates
  // in-flight fetches across a `refresh`). A refresh reuses the current stamp, so
  // a fetch already running for this cwd stays valid.
  const generation = useRef(0);
  // Per-source in-flight guard, holding the generation a fetch is running for (or
  // null). A refresh coalesces against a fetch already running for the same
  // generation; a fetch for a superseded generation is left to drop on its own.
  const filesInFlight = useRef<number | null>(null);
  const branchesInFlight = useRef<number | null>(null);
  const changedInFlight = useRef<number | null>(null);

  const loadFiles = useCallback((dir: string, gen: number) => {
    if (filesInFlight.current === gen) return;
    filesInFlight.current = gen;
    void (async () => {
      try {
        const list = (await ListDirFiles(dir)) as DirFileEntry[];
        if (generation.current !== gen) return;
        const items: MentionItem[] = list.map((e) => ({
          kind: e.isDir ? "dir" : "file",
          label: e.path,
          insert: e.path,
        }));
        fileCache.current.set(dir, items);
        setFiles(items);
      } catch {
        // Keep the previous list rather than flickering the menu to empty.
      } finally {
        if (filesInFlight.current === gen) filesInFlight.current = null;
      }
    })();
  }, []);

  const loadBranches = useCallback((dir: string, gen: number) => {
    if (branchesInFlight.current === gen) return;
    branchesInFlight.current = gen;
    void (async () => {
      try {
        const list = (await ListBranches(dir)) as BranchEntry[];
        if (generation.current !== gen) return;
        const seen = new Set<string>();
        const items: MentionItem[] = [];
        for (const b of list) {
          if (seen.has(b.name)) continue;
          seen.add(b.name);
          items.push({ kind: "branch", label: b.name, insert: b.name });
        }
        branchCache.current.set(dir, items);
        setBranches(items);
      } catch {
        // Keep the previous list rather than flickering the menu to empty.
      } finally {
        if (branchesInFlight.current === gen) branchesInFlight.current = null;
      }
    })();
  }, []);

  const loadChanged = useCallback((dir: string, gen: number) => {
    if (changedInFlight.current === gen) return;
    changedInFlight.current = gen;
    void (async () => {
      try {
        const list = (await GitChangedFiles(dir)) as ChangedFileEntry[];
        if (generation.current !== gen) return;
        setChanged(list.map((e) => ({ kind: "changed", label: e.path, insert: e.path })));
      } catch {
        if (generation.current === gen) setChanged([]);
      } finally {
        if (changedInFlight.current === gen) changedInFlight.current = null;
      }
    })();
  }, []);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    if (!active || !cwd) {
      setFiles([]);
      setChanged([]);
      setBranches([]);
      return;
    }
    const cachedFiles = fileCache.current.get(cwd);
    if (cachedFiles) setFiles(cachedFiles);
    else loadFiles(cwd, gen);
    const cachedBranches = branchCache.current.get(cwd);
    if (cachedBranches) setBranches(cachedBranches);
    else loadBranches(cwd, gen);
    loadChanged(cwd, gen);
    // Bump the stamp on unmount too, so a fetch still in flight then drops its
    // result instead of setting state on a gone component.
    return () => {
      generation.current += 1;
    };
  }, [cwd, active, loadFiles, loadBranches, loadChanged]);

  // Re-read the backend sources on demand (the editor regaining focus). Reuses
  // the current generation so a fetch already running for this cwd is not
  // duplicated, and keeps the shown lists in place until fresh data replaces them.
  const refresh = useCallback(() => {
    if (!active || !cwd) return;
    const gen = generation.current;
    loadChanged(cwd, gen);
    loadFiles(cwd, gen);
    loadBranches(cwd, gen);
  }, [active, cwd, loadChanged, loadFiles, loadBranches]);

  const projectItems = useMemo<MentionItem[]>(() => {
    const present = new Set(projects.map((p) => p.name));
    return projects.map((p) => ({
      kind: isDuplicate(p, present) ? "duplicate" : "project",
      label: projectDisplayName(p, findParentProject(p, projects)),
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

  return { filter, refresh };
}
