import { useEffect, useState } from "react";
import { SetWorktreeFiles, WorktreeFiles } from "../../bridge/commands";
import { toast } from "../notifications/toast";

export type BringMode = "copy" | "link";

export interface IgnoredFile {
  path: string;
  size: number;
  suggested: boolean;
}

interface Choice {
  candidates: IgnoredFile[];
  copy: string[];
  link: string[];
}

/** The git-ignored files a project's new worktrees bring, and which ones: read
 *  once for the dialog, and saved to the project's config on every change.
 *  Null until read, or where the machine's lpm can't list them. */
export function useWorktreeFiles(projectName: string) {
  const [files, setFiles] = useState<IgnoredFile[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setModeState] = useState<BringMode>("copy");

  useEffect(() => {
    let live = true;
    setFiles(null);
    WorktreeFiles(projectName)
      .then((choice: Choice) => {
        if (!live || !choice) return;
        const linking = choice.link.length > 0 && choice.copy.length === 0;
        setFiles(choice.candidates ?? []);
        setChosen(new Set([...choice.copy, ...choice.link]));
        setModeState(linking ? "link" : "copy");
      })
      .catch(() => live && setFiles([]));
    return () => {
      live = false;
    };
  }, [projectName]);

  const save = (next: Set<string>, nextMode: BringMode) => {
    const paths = [...next];
    const copy = nextMode === "copy" ? paths : [];
    const link = nextMode === "link" ? paths : [];
    SetWorktreeFiles(projectName, copy, link).catch((err: unknown) =>
      toast.error(`Couldn't save which files worktrees bring: ${String(err)}`),
    );
  };

  const toggle = (path: string) => {
    const next = new Set(chosen);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setChosen(next);
    save(next, mode);
  };

  const setMode = (next: BringMode) => {
    setModeState(next);
    save(chosen, next);
  };

  return { files, chosen, mode, toggle, setMode };
}
