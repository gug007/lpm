import type { PrCheck, PrCheckState, PullRequestInfo } from "./types";

export type ChecksVerdict = "fail" | "pending" | "pass";

export interface ChecksSummary {
  verdict: ChecksVerdict;
  failed: number;
  pending: number;
  passed: number;
}

const ORDER: Record<PrCheckState, number> = { fail: 0, pending: 1, pass: 2, skipped: 3 };

/** What the checks add up to, or null when the PR has none worth showing: a
 *  merged or closed PR, or checks that were all skipped. */
export function checksSummary(pr: PullRequestInfo): ChecksSummary | null {
  if (pr.state !== "OPEN") return null;
  const counted = (pr.checks ?? []).filter((check) => check.state !== "skipped");
  if (counted.length === 0) return null;
  const count = (state: PrCheckState) => counted.filter((check) => check.state === state).length;
  const failed = count("fail");
  const pending = count("pending");
  return {
    verdict: failed > 0 ? "fail" : pending > 0 ? "pending" : "pass",
    failed,
    pending,
    passed: count("pass"),
  };
}

export function checksLabel(summary: ChecksSummary): string {
  if (summary.verdict === "fail") return `${summary.failed} failing`;
  if (summary.verdict === "pending") return `${summary.pending} running`;
  return "Checks passed";
}

/** Failing first, then running, passed and skipped; by name within each. */
export function sortedChecks(checks: PrCheck[]): PrCheck[] {
  return [...checks].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
}

export function actionsRunId(url: string): string | null {
  return /\/actions\/runs\/(\d+)/.exec(url)?.[1] ?? null;
}

/** What an agent asked to fix the failing checks is told: which ones fail and
 *  where, and the `gh` commands that print why. */
export function fixChecksPrompt(pr: PullRequestInfo): string {
  const failing = sortedChecks(pr.checks ?? []).filter((check) => check.state === "fail");
  const lines = failing.map((check) => `- ${check.name}${check.url ? ` — ${check.url}` : ""}`);
  const runs = [...new Set(failing.map((check) => actionsRunId(check.url)).filter((id) => id !== null))];
  const howToRead = [`\`gh pr checks ${pr.number}\``, ...runs.map((id) => `\`gh run view ${id} --log-failed\``)];
  return [
    `CI checks are failing on pull request #${pr.number} (${pr.url}):`,
    ...lines,
    "",
    `Find out why with ${howToRead.join(" and ")}, fix the cause, and run the same checks locally where you can to confirm the fix.`,
  ].join("\n");
}
