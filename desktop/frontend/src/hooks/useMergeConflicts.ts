import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import {
  GitContinueMerge,
  GitMarkConflictResolved,
  GitMergeConflicts,
  GitMergeState,
  GitStopConflictAI,
  GitTakeConflictSide,
} from "../../bridge/commands";
import { stateFromPaths, type ConflictSide, type MergeState } from "../mergeConflicts";
import { useFileViewerStore } from "../store/fileViewer";
import { useEventListener } from "./useEventListener";
import { useGitChanged } from "./useGitChanged";

const RESOLVING_POLL_MS = 2000;

export function loadMergeState(projectPath: string): Promise<MergeState> {
  return (GitMergeState(projectPath) as Promise<MergeState>).catch(() =>
    (GitMergeConflicts(projectPath) as Promise<string[] | null>)
      .then((paths) => stateFromPaths(paths ?? []))
      .catch(() => stateFromPaths([])),
  );
}

// The conflicts a stopped merge left, kept current while `watching`: on window
// focus, on the watcher's git-changed, when the file viewer closes, and after
// each action.
export function useMergeConflicts(projectPath: string, watching: boolean) {
  const [state, setState] = useState<MergeState | null>(null);
  const [sides, setSides] = useState<ReadonlyMap<string, ConflictSide>>(new Map());
  const [pending, setPending] = useState<string | null>(null);
  const watchingRef = useRef(watching);
  watchingRef.current = watching;

  const reload = useCallback(async () => {
    const next = await loadMergeState(projectPath);
    setState(next);
    return next;
  }, [projectPath]);

  const recheck = useCallback(() => {
    if (watchingRef.current) void reload();
  }, [reload]);

  useEffect(() => {
    setSides(new Map());
    if (!watching) setState(null);
  }, [watching, projectPath]);

  const resolving = watching && !!state?.resolving;
  useEffect(() => {
    if (!resolving) return;
    const timer = setInterval(recheck, RESOLVING_POLL_MS);
    return () => clearInterval(timer);
  }, [resolving, recheck]);

  useEventListener("focus", recheck);
  useGitChanged(projectPath, recheck, watching);

  const viewing = useFileViewerStore((s) => s.current !== null);
  useEffect(() => {
    if (!viewing) recheck();
  }, [viewing, recheck]);

  const run = async (key: string, failure: string, op: () => Promise<unknown>) => {
    setPending(key);
    try {
      await op();
      return true;
    } catch (err) {
      toast.error(`${failure}: ${err}`);
      return false;
    } finally {
      setPending(null);
      await reload();
    }
  };

  const takeSide = (path: string, side: ConflictSide) =>
    run(path, `Use ${side}`, async () => {
      await GitTakeConflictSide(projectPath, path, side);
      setSides((prev) => new Map(prev).set(path, side));
    });

  const markResolved = (path: string) =>
    run(path, "Mark resolved", () => GitMarkConflictResolved(projectPath, path));

  const continueMerge = () => run("", "Continue merge", () => GitContinueMerge(projectPath));

  const stopAI = () => run("stop", "Stop", () => GitStopConflictAI(projectPath));

  return { state, sides, pending, reload, takeSide, markResolved, continueMerge, stopAI };
}

export type MergeConflicts = ReturnType<typeof useMergeConflicts>;
