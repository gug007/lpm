import { GitChangedFiles, GitDiff, GitShowCommit, PullRequestDiscussion } from "../bridge/commands";
import type { MentionItem } from "./mentions";

// How much of a diff, commit or review thread goes into one prompt.
export const GIT_MENTION_MAX_LINES = 600;

export type PullRequestThread = NonNullable<Awaited<ReturnType<typeof PullRequestDiscussion>>>;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

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

export function formatPullRequestThread(pr: PullRequestThread): string {
  const out = [`#${pr.number} ${pr.title}`, pr.url];
  if (pr.body) out.push("", pr.body);
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

// The block a "diff", "commit" or "pr" mention expands to, read fresh from the
// terminal's checkout at pick time. Rejects with a message to show the user.
export async function captureGitMention(item: MentionItem, cwd: string): Promise<string> {
  if (item.kind === "diff") {
    const files = ((await GitChangedFiles(cwd)) as { path: string }[] | null) ?? [];
    const diff = files.length ? String((await GitDiff(cwd, files.map((f) => f.path))) ?? "").trim() : "";
    if (!diff) throw new Error("No uncommitted changes");
    return fencedBlock(`Uncommitted changes (${plural(files.length, "file")})`, capLines(diff), "diff");
  }
  if (item.kind === "commit") {
    const shown = (await GitShowCommit(cwd, item.insert)).trim();
    if (!shown) throw new Error(`Couldn't read commit ${item.insert}`);
    return fencedBlock(`Commit ${item.insert}`, capLines(shown), "diff");
  }
  if (item.kind === "pr") {
    const pr = await PullRequestDiscussion(cwd);
    if (!pr) throw new Error("This branch has no pull request");
    return fencedBlock(`Pull request #${pr.number}`, capLines(formatPullRequestThread(pr)));
  }
  throw new Error(`${item.label} can't be attached`);
}
