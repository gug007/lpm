import type { AICLI } from "./types";

export interface HistoryCommit {
  hash: string;
  short: string;
  subject: string;
  body: string;
  author: string;
  email: string;
  // Unix seconds, author time.
  time: number;
  parents: number;
  // "Name <email>" from each Co-authored-by trailer.
  coAuthors: string[];
  // On no remote branch yet. False for every commit when there is no remote.
  unpushed: boolean;
}

export interface GitHistoryPage {
  commits: HistoryCommit[];
  hasMore: boolean;
}

export interface CommitFile {
  path: string;
  oldPath: string | null;
  // "added" | "modified" | "deleted" | "renamed", as the changed-files lists use.
  status: string;
  // Null for a binary file.
  added: number | null;
  removed: number | null;
}

export const HISTORY_PAGE = 100;

const AGENT_MARKS: { agent: AICLI; pattern: RegExp }[] = [
  { agent: "claude", pattern: /\bclaude\b|@anthropic\.com/i },
  { agent: "codex", pattern: /\bcodex\b|@openai\.com/i },
  { agent: "gemini", pattern: /\bgemini\b/i },
  { agent: "opencode", pattern: /\bopencode\b/i },
];

/** The coding agent a commit credits as its co-author, when there is one. */
export function commitAgent(commit: Pick<HistoryCommit, "coAuthors">): AICLI | null {
  for (const coAuthor of commit.coAuthors) {
    const hit = AGENT_MARKS.find(({ pattern }) => pattern.test(coAuthor));
    if (hit) return hit.agent;
  }
  return null;
}

/** The co-author's name without the address: "Claude Opus 5.5". */
export function coAuthorName(coAuthor: string): string {
  return coAuthor.replace(/\s*<[^>]*>\s*$/, "").trim() || coAuthor;
}

/** The message under the subject, without the trailer lines the header
 *  already shows. */
export function commitBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^co-authored-by:/i.test(line.trim()))
    .join("\n")
    .trim();
}

/** Where the pushed commits start: the row the remote's line is drawn above.
 *  Null when every listed commit is pushed or none is. */
export function remoteBoundary(commits: HistoryCommit[]): number | null {
  const first = commits.findIndex((c) => !c.unpushed);
  return first > 0 ? first : null;
}

export function lineTotals(files: CommitFile[]): { added: number; removed: number } {
  return files.reduce(
    (sum, f) => ({ added: sum.added + (f.added ?? 0), removed: sum.removed + (f.removed ?? 0) }),
    { added: 0, removed: 0 },
  );
}
