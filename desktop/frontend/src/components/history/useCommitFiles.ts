import { useEffect, useState } from "react";
import { GitCommitFilePatch, GitCommitFiles } from "../../../bridge/commands";
import type { CommitFile } from "../../gitHistory";

export interface CommitFilesState {
  files: CommitFile[] | null;
  error: string | null;
  selected: CommitFile | null;
  select: (file: CommitFile) => void;
  patch: string;
  patchLoading: boolean;
}

/** One commit's files, and the patch of the one picked (the first, until
 *  another is). Keyed by commit: a different hash takes a fresh mount. */
export function useCommitFiles(projectPath: string, hash: string): CommitFilesState {
  const [files, setFiles] = useState<CommitFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommitFile | null>(null);
  const [patch, setPatch] = useState("");
  const [patchLoading, setPatchLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    GitCommitFiles(projectPath, hash)
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        setSelected(list[0] ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, hash]);

  useEffect(() => {
    setPatch("");
    if (!selected) return;
    let cancelled = false;
    setPatchLoading(true);
    GitCommitFilePatch(projectPath, hash, selected.path, selected.oldPath)
      .then((text) => {
        if (!cancelled) setPatch(text);
      })
      .catch(() => {
        if (!cancelled) setPatch("");
      })
      .finally(() => {
        if (!cancelled) setPatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, hash, selected]);

  return { files, error, selected, select: setSelected, patch, patchLoading };
}
