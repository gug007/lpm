// A repository's issues as issues.rs reads them through gh or glab.
import { OpenIssues } from "../bridge/commands";
import type { MentionItem } from "./mentions";

export interface OpenIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  labels: string[];
  // What a worktree started from it calls its branch.
  branch: string;
}

export type IssueStart = Pick<OpenIssue, "number" | "title">;

export interface IssueText {
  number: number;
  title: string;
  url: string;
  // What the "@" menu puts in the input.
  mention: string;
  // What an agent started on it is told.
  prompt: string;
}

export function issueMentionItems(issues: OpenIssue[]): MentionItem[] {
  return issues.map((issue) => ({
    kind: "issue",
    label: `#${issue.number} ${issue.title}`,
    insert: String(issue.number),
    search: `${issue.number} #${issue.number} ${issue.title}`,
    detail: issue.labels.join(", ") || undefined,
  }));
}

// What a picker shows for `query`: the words in any order, in the number, the
// title, the labels or who opened it.
export function filterIssues(issues: OpenIssue[], query: string): OpenIssue[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return issues;
  return issues.filter((issue) => {
    const text = `#${issue.number} ${issue.title} ${issue.labels.join(" ")} ${issue.author}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// Fails quietly: a checkout with no forge, or a signed-out CLI, has no issues
// to offer.
export async function loadIssueMentions(cwd: string): Promise<MentionItem[]> {
  return issueMentionItems(await OpenIssues(cwd));
}
