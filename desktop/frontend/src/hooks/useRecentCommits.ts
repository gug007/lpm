import { useCallback, useEffect, useRef, useState } from "react";
import { GitHistory } from "../../bridge/commands";
import type { HistoryCommit } from "../gitHistory";
import { useGitChanged } from "./useGitChanged";

const RECENT = 3;
const NONE: HistoryCommit[] = [];

/** The branch's newest commits, reloaded when a commit, push or checkout changes
 *  them. Working-tree edits leave them alone, and a hidden project waits until
 *  it shows again. */
export function useRecentCommits(projectPath: string, active = true): HistoryCommit[] {
  const [loaded, setLoaded] = useState<{ path: string; commits: HistoryCommit[] } | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const page = await GitHistory(projectPath, 0, RECENT).catch(() => null);
    if (mine === seq.current && page) setLoaded({ path: projectPath, commits: page.commits });
  }, [projectPath]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const onGitChanged = useCallback(
    (files: string[] | null) => {
      if (files === null) void load();
    },
    [load],
  );
  useGitChanged(projectPath, onGitChanged, active);

  return loaded?.path === projectPath ? loaded.commits : NONE;
}
