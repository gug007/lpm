import { useCallback, useEffect, useState } from "react";
import { PullRequestMergeOffer } from "../../bridge/commands";
import { mergeStatus } from "../prMerge";
import { useBranchPr } from "../store/branchPr";
import type { PullRequestMergeInfo } from "../types";
import { CHECKS_POLL_MS } from "./useBranchPullRequest";
import { useEventListener } from "./useEventListener";

// How soon to ask again while GitHub works out whether it merges cleanly; the
// phone waits as long.
const CHECKING_MS = 3_000;

type MergeOffer =
  | { kind: "loading" }
  /** No open pull request any more, or `gh` (or an older paired computer) can't say. */
  | { kind: "missing" }
  | { kind: "loaded"; info: PullRequestMergeInfo };

// The open pull request of `projectPath`'s branch with how GitHub stands on
// merging it, read while the card is open and asked again while that is still
// settling. The footer's poll leaves these fields out (asking makes GitHub work
// out mergeability), so each answer also stands in for its next lookup.
export function usePrMergeOffer(projectPath: string, branch: string): MergeOffer {
  const [offer, setOffer] = useState<MergeOffer>({ kind: "loading" });

  const load = useCallback(async () => {
    const info = await PullRequestMergeOffer(projectPath).catch(() => null);
    if (info) useBranchPr.getState().setEntry(projectPath, { branch, pr: info, checkedAt: Date.now() });
    setOffer(info ? { kind: "loaded", info } : { kind: "missing" });
  }, [projectPath, branch]);

  useEffect(() => {
    void load();
  }, [load]);

  const settling = offer.kind === "loaded" ? mergeStatus(offer.info).kind : null;
  const pollMs = settling === "checking" ? CHECKING_MS : settling === "waiting" ? CHECKS_POLL_MS : 0;

  // A hidden window stops asking and asks again once it shows.
  useEffect(() => {
    if (!pollMs || document.hidden) return;
    const timer = setTimeout(() => void load(), pollMs);
    return () => clearTimeout(timer);
  }, [offer, pollMs, load]);
  useEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) void load();
    },
    document,
    pollMs > 0,
  );

  return offer;
}
