import { useCallback, useEffect, useRef, useState } from "react";
import { GitFileDiff } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import type { FileDiffResult } from "../review/reviewSource";

export type HeadText =
  | { status: "loading" }
  | { status: "ready"; original: string }
  // Binary or too large: there is no text to compare, the file opens as is.
  | { status: "unavailable" }
  | { status: "error"; message: string };

export interface DiffSource {
  head: HeadText;
  deleted: boolean;
}

// The editor can show the open file against HEAD instead of on its own, which
// is what the git view opens into. `wanted` is set at open time and can be
// flipped from the header; the diff exists only for a file git lists as
// changed.
export function useDiffView(
  root: string,
  path: string | null,
  status: string | undefined,
  active: boolean,
) {
  const [wanted, setWanted] = useState(false);
  const available = !!path && !!status;
  const showing = wanted && available;
  const [head, setHead] = useState<HeadText>({ status: "loading" });
  const reqRef = useRef(0);

  const fetchHead = useCallback(async () => {
    if (!path || !status) return;
    const token = ++reqRef.current;
    let next: HeadText;
    try {
      const res = (await GitFileDiff(root, path, status)) as FileDiffResult;
      next =
        res.binary || res.tooLarge
          ? { status: "unavailable" }
          : { status: "ready", original: res.original ?? "" };
    } catch (err) {
      next = { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
    if (token === reqRef.current) setHead(next);
  }, [root, path, status]);

  useEffect(() => {
    if (!showing) return;
    setHead({ status: "loading" });
    void fetchHead();
  }, [showing, fetchHead]);

  // The file's own edits arrive through the buffer; only HEAD moving (a
  // commit, a checkout) needs the original fetched again.
  const onChanged = useCallback(
    (changed: string[] | null) => {
      if (!showing) return;
      if (changed && path && !changed.some((p) => p.toLowerCase() === path.toLowerCase())) return;
      void fetchHead();
    },
    [showing, path, fetchHead],
  );
  useGitChanged(root, onChanged, active);

  return {
    wanted,
    setWanted,
    available,
    diff: showing ? { head, deleted: status === "deleted" } : null,
  };
}
