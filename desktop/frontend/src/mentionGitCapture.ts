import { GitChangedFiles, GitDiff, GitShowCommit, PullRequestDiscussion, ReadIssue } from "../bridge/commands";
import type { MentionItem } from "./mentions";
import { plural } from "./projectArchive";

// How much of a diff, commit or review thread goes into one prompt.
export const GIT_MENTION_MAX_LINES = 600;

export type PullRequestThread = NonNullable<Awaited<ReturnType<typeof PullRequestDiscussion>>>;

// A fence longer than any backtick run inside, so a code block in a commit
// message, a review comment or captured logs can't close it early. The trailing
// newline leaves the caret on a fresh line below it.
export function fencedBlock(heading: string, body: string, lang = ""): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${heading}:\n${fence}${lang}\n${body}\n${fence}\n`;
}

export function capLines(text: string, max = GIT_MENTION_MAX_LINES): string {
  const lines = text.split("\n");
  if (lines.length <= max) return text;
  return `${lines.slice(0, max).join("\n")}\n… ${plural(lines.length - max, "more line")} left out`;
}

const VERDICT: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

export interface ThreadParts {
  description: boolean;
  discussion: boolean;
}

export function formatPullRequestThread(
  pr: PullRequestThread,
  parts: ThreadParts = { description: true, discussion: true },
): string {
  const out = [`#${pr.number} ${pr.title}`, pr.url];
  if (parts.description && pr.body) out.push("", pr.body);
  if (!parts.discussion) return out.join("\n");
  out.push("");
  if (pr.notes.length === 0) {
    out.push("No review comments yet.");
    return out.join("\n");
  }
  out.push("Discussion:");
  for (const n of pr.notes) {
    const verdict = n.kind === "review" ? ` ${VERDICT[n.state] ?? n.state.toLowerCase()}` : "";
    const where = n.kind === "line" && n.path ? ` on ${n.path}${n.line ? `:${n.line}` : ""}` : "";
    const head = `- ${n.author}${verdict}${where}`;
    out.push(n.body ? `${head}: ${n.body.replace(/\n/g, "\n  ")}` : head);
  }
  return out.join("\n");
}

// The uncommitted changes in `files` as a block, "" when they have none.
export async function diffBlock(cwd: string, files: string[]): Promise<string> {
  const diff = files.length ? String((await GitDiff(cwd, files)) ?? "").trim() : "";
  return diff && fencedBlock(`Uncommitted changes (${plural(files.length, "file")})`, capLines(diff), "diff");
}

// The message and file summary of a GitShowCommit, without the patch.
export function withoutPatch(shown: string): string {
  const at = shown.search(/^diff --git /m);
  return at === -1 ? shown : shown.slice(0, at).trimEnd();
}

export async function commitBlock(cwd: string, sha: string, withDiff = true): Promise<string> {
  const shown = (await GitShowCommit(cwd, sha)).trim();
  if (!shown) throw new Error(`Couldn't read commit ${sha}`);
  return fencedBlock(`Commit ${sha}`, capLines(withDiff ? shown : withoutPatch(shown)), "diff");
}

export async function pullRequestBlock(cwd: string, parts?: ThreadParts): Promise<string> {
  const pr = await PullRequestDiscussion(cwd);
  if (!pr) throw new Error("This branch has no pull request");
  return fencedBlock(`Pull request #${pr.number}`, capLines(formatPullRequestThread(pr, parts)));
}

// The block a "diff", "commit", "pr" or "issue" mention expands to, read fresh
// from the terminal's checkout at pick time. Rejects with a message to show the user.
export async function captureGitMention(item: MentionItem, cwd: string): Promise<string> {
  if (item.kind === "diff") {
    const files = ((await GitChangedFiles(cwd)) as { path: string }[] | null) ?? [];
    const block = await diffBlock(cwd, files.map((f) => f.path));
    if (!block) throw new Error("No uncommitted changes");
    return block;
  }
  if (item.kind === "commit") return commitBlock(cwd, item.insert);
  if (item.kind === "pr") return pullRequestBlock(cwd);
  if (item.kind === "issue") return (await ReadIssue(cwd, Number(item.insert))).mention;
  throw new Error(`${item.label} can't be attached`);
}
