import { useCallback, useEffect, useRef, useState } from "react";
import { GitChangedFiles } from "../../../bridge/commands";
import { useEventListener } from "../../hooks/useEventListener";
import { useGitChanged } from "../../hooks/useGitChanged";

export interface ChangedFile {
  path: string;
  status: string;
}

export type Changes =
  | { status: "loading" }
  | { status: "ready"; files: ChangedFile[] }
  | { status: "error"; message: string };

const IDLE: Changes = { status: "loading" };

function sameChanges(a: Changes, b: Changes): boolean {
  if (a.status !== "ready" || b.status !== "ready") return false;
  return (
    a.files.length === b.files.length &&
    a.files.every((f, i) => f.path === b.files[i].path && f.status === b.files[i].status)
  );
}

// The working tree's uncommitted files, fetched while the tab is shown and
// kept fresh from the project watcher. Hidden, a change only marks the list
// stale, and the next showing fetches once.
export function useChangedFiles(root: string, active: boolean): Changes {
  const [changes, setChanges] = useState<Changes>(IDLE);
  const liveRef = useRef(active);
  liveRef.current = active;
  const staleRef = useRef(true);
  const inflightRef = useRef(false);
  const againRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!liveRef.current) {
      staleRef.current = true;
      return;
    }
    if (inflightRef.current) {
      againRef.current = true;
      return;
    }
    inflightRef.current = true;
    staleRef.current = false;
    let next: Changes;
    try {
      const raw = (await GitChangedFiles(root)) as ChangedFile[];
      const files = Array.isArray(raw) ? raw.map((f) => ({ path: f.path, status: f.status })) : [];
      next = { status: "ready", files };
    } catch (err) {
      next = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
    inflightRef.current = false;
    setChanges((prev) => (sameChanges(prev, next) ? prev : next));
    if (againRef.current) {
      againRef.current = false;
      void refresh();
    }
  }, [root]);

  useEffect(() => {
    if (active && staleRef.current) void refresh();
  }, [active, refresh]);

  useEventListener("focus", () => void refresh());
  useGitChanged(root, refresh);

  return changes;
}
