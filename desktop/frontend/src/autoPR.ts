import { slugify } from "./slugify";

export type AutoPRStepId = "branch" | "commit" | "push" | "pr";
export type AutoPRStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export const AUTO_PR_STEP_IDS: AutoPRStepId[] = ["branch", "commit", "push", "pr"];

export interface AutoPRStep {
  id: AutoPRStepId;
  status: AutoPRStepStatus;
  detail?: string;
}

export interface AutoPRRepoState {
  branch: string;
  defaultBranch: string;
  detached: boolean;
  uncommitted: number;
  hasUpstream: boolean;
  ahead: number;
}

export interface AutoPROps {
  generateBranchName(): Promise<string>;
  createBranch(name: string): Promise<void>;
  changedPaths(): Promise<string[]>;
  generateCommitMessage(paths: string[]): Promise<string>;
  commit(message: string, paths: string[]): Promise<void>;
  push(): Promise<void>;
  generatePRTitle(base: string): Promise<string>;
  generatePRDescription(base: string): Promise<string>;
  createPullRequest(title: string, body: string, base: string): Promise<string>;
}

export interface AutoPRResult {
  url: string;
  title: string;
  branch: string;
  base: string;
}

export type AutoPRReport = (
  id: AutoPRStepId,
  status: AutoPRStepStatus,
  detail?: string,
) => void;

export function needsBranch(state: AutoPRRepoState): boolean {
  return state.detached || !state.branch || state.branch === state.defaultBranch;
}

// Which steps the run will perform for this checkout; the rest are reported as
// skipped up front so the list shows the whole plan before anything happens.
export function planAutoPR(state: AutoPRRepoState): AutoPRStepId[] {
  const steps: AutoPRStepId[] = [];
  const branch = needsBranch(state);
  const commit = state.uncommitted > 0;
  if (branch) steps.push("branch");
  if (commit) steps.push("commit");
  if (branch || commit || !state.hasUpstream || state.ahead > 0) steps.push("push");
  steps.push("pr");
  return steps;
}

export function nothingToSubmitReason(state: AutoPRRepoState): string | null {
  if (needsBranch(state) && state.uncommitted === 0) {
    const where = state.detached ? "this commit" : state.defaultBranch;
    return `Nothing to open a pull request for: no changes on ${where}.`;
  }
  return null;
}

export function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

export async function runAutoPR(
  state: AutoPRRepoState,
  ops: AutoPROps,
  report: AutoPRReport,
): Promise<AutoPRResult> {
  const plan = new Set(planAutoPR(state));
  for (const id of AUTO_PR_STEP_IDS) {
    if (!plan.has(id)) report(id, "skipped");
  }
  const base = state.defaultBranch;
  let branch = state.branch;

  const step = async <T,>(
    id: AutoPRStepId,
    detail: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> => {
    report(id, "running", detail);
    try {
      return await fn();
    } catch (err) {
      report(id, "failed", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  if (plan.has("branch")) {
    branch = await step("branch", "Naming the branch…", async () => {
      const name = slugify(await ops.generateBranchName(), { allowSlash: true });
      if (!name) throw new Error("empty branch name");
      report("branch", "running", `Creating ${name}…`);
      await ops.createBranch(name);
      report("branch", "done", name);
      return name;
    });
  }

  if (plan.has("commit")) {
    await step("commit", "Writing the commit message…", async () => {
      const paths = await ops.changedPaths();
      if (paths.length === 0) {
        report("commit", "skipped");
        return;
      }
      const message = (await ops.generateCommitMessage(paths)).trim();
      if (!message) throw new Error("empty commit message");
      report("commit", "running", "Committing…");
      await ops.commit(message, paths);
      report("commit", "done", firstLine(message));
    });
  }

  if (plan.has("push")) {
    await step("push", `Pushing ${branch}…`, async () => {
      await ops.push();
      report("push", "done", `origin/${branch}`);
    });
  }

  return step("pr", "Writing the title and description…", async () => {
    const [title, body] = await Promise.all([
      ops.generatePRTitle(base),
      ops.generatePRDescription(base),
    ]);
    const cleanTitle = firstLine(title);
    if (!cleanTitle) throw new Error("empty pull request title");
    report("pr", "running", "Opening the pull request…");
    const url = (await ops.createPullRequest(cleanTitle, body.trim(), base)).trim();
    report("pr", "done", cleanTitle);
    return { url, title: cleanTitle, branch, base };
  });
}
