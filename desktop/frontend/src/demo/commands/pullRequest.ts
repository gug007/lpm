import type { CommandMap } from "../backend";
import type { SeedPullRequest } from "../seed/types";
import { emitEvent } from "../ipc";
import { projectAt } from "./state";
import {
  PR_MERGE_WATCH_EVENT,
  type PrMergeMethod,
  type PrMergeWatch,
  type PullRequestInfo,
  type PullRequestMergeInfo,
} from "../../types";

// A seeded pull request as the footer has seen it: its checks pass a while
// after the first lookup, and a wait to merge merges it then.
interface Live {
  since: number;
  merged: boolean;
  watch: PrMergeWatch | null;
  timer?: ReturnType<typeof setTimeout>;
}

const live = new Map<string, Live>();

function find(cwd: unknown): { pr: SeedPullRequest; branch: string; state: Live } | null {
  const p = projectAt(String(cwd));
  if (!p?.git.pr) return null;
  let state = live.get(p.root);
  if (!state) {
    state = { since: Date.now(), merged: false, watch: null };
    live.set(p.root, state);
  }
  return { pr: p.git.pr, branch: p.git.branch, state };
}

const msLeft = (pr: SeedPullRequest, state: Live) => Math.max(0, state.since + pr.passAfterMs - Date.now());

function info(pr: SeedPullRequest, state: Live): PullRequestInfo {
  const passed = msLeft(pr, state) === 0;
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    isDraft: false,
    state: state.merged ? "MERGED" : "OPEN",
    headMerged: state.merged,
    checks: pr.checks.map(({ name, workflow, state: check }) => ({
      name,
      workflow,
      url: `${pr.url}/checks`,
      state: passed ? "pass" : check,
    })),
  };
}

function settle(path: string, state: Live, next: PrMergeWatch["state"]) {
  if (!state.watch) return;
  clearTimeout(state.timer);
  emitEvent(PR_MERGE_WATCH_EVENT, { ...state.watch, path, state: next });
  state.watch = null;
}

export const pullRequestCommands: CommandMap = {
  branch_pull_request: ({ cwd }) => {
    const found = find(cwd);
    return found ? info(found.pr, found.state) : null;
  },
  pull_request_merge_offer: ({ cwd }): PullRequestMergeInfo | null => {
    const found = find(cwd);
    if (!found || found.state.merged) return null;
    const { pr, branch, state } = found;
    return {
      ...info(pr, state),
      merge: {
        mergeable: "MERGEABLE",
        state: msLeft(pr, state) === 0 ? "CLEAN" : "BLOCKED",
        review: "APPROVED",
        head: branch,
        base: pr.base,
        methods: ["squash", "merge", "rebase"],
        deletesBranch: false,
      },
    };
  },
  merge_pull_request: ({ cwd }) => {
    const found = find(cwd);
    if (found) found.state.merged = true;
    return false;
  },
  merge_pull_request_when_ready: ({ cwd, number, title, method, deleteBranch, bypass }) => {
    const found = find(cwd);
    if (!found) return null;
    const path = String(cwd);
    const { pr, state } = found;
    state.watch = {
      path,
      number: Number(number),
      title: String(title),
      method: method as PrMergeMethod,
      deleteBranch: Boolean(deleteBranch),
      bypass: Boolean(bypass),
      state: "waiting",
      deletedBranch: false,
    };
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.merged = true;
      settle(path, state, "merged");
    }, msLeft(pr, state) + 1500);
    return null;
  },
  cancel_pull_request_merge: ({ cwd }) => {
    const found = find(cwd);
    if (found) settle(String(cwd), found.state, "cancelled");
    return null;
  },
  pull_request_merge_watch: ({ cwd }) => find(cwd)?.state.watch ?? null,
};
