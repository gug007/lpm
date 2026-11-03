import type { PrCheck, PrCheckState, PullRequestInfo } from "./types";

export type ChecksVerdict = "fail" | "pending" | "pass";

export interface ChecksSummary {
  verdict: ChecksVerdict;
  failed: number;
  pending: number;
  passed: number;
}

const ORDER: Record<PrCheckState, number> = { fail: 0, pending: 1, pass: 2, skipped: 3 };

/** What the checks add up to, or null when there's none worth showing: none at
 *  all, or only skipped ones. */
export function summarizeChecks(checks: PrCheck[]): ChecksSummary | null {
  const counted = checks.filter((check) => check.state !== "skipped");
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

/** A PR's checks, which a merged or closed PR no longer shows. */
export function checksSummary(pr: PullRequestInfo): ChecksSummary | null {
  if (pr.state !== "OPEN") return null;
  return summarizeChecks(pr.checks ?? []);
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

/** The GitHub Actions runs the failing checks belong to, each once. */
export function failingRunIds(checks: PrCheck[]): string[] {
  const ids = checks.filter((check) => check.state === "fail").map((check) => actionsRunId(check.url));
  return [...new Set(ids.filter((id) => id !== null))];
}

/** The checks with the failed ones of `runIds` running again. */
export function markRerunning(checks: PrCheck[], runIds: string[]): PrCheck[] {
  return checks.map((check) =>
    check.state === "fail" && runIds.includes(actionsRunId(check.url) ?? "") ? { ...check, state: "pending" } : check,
  );
}
