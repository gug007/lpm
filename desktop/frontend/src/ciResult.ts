// What the app hears when CI finishes on a commit pushed from this computer
// (ci_watch.rs), or from a connected one, which adds `slug` and `machine`.
export const CI_RESULT_EVENT = "ci-result";
export const PEER_CI_RESULT_EVENT = "peer-ci-result";

export interface CiResult {
  project: string;
  projectLabel: string;
  branch: string;
  sha: string;
  title: string;
  url: string;
  passed: boolean;
  /** "CI failed: Linux host", "CI passes again", as the banner and phones say it. */
  summary: string;
  fixPrompt?: string;
  slug?: string;
  machine?: string;
}

export function ciToast(result: CiResult): { title: string; description: string; tag: string } {
  const where = `${result.projectLabel} · ${result.branch}`;
  return {
    title: result.summary,
    description: `${result.sha} ${result.title}`,
    tag: result.machine ? `${where} on ${result.machine}` : where,
  };
}
