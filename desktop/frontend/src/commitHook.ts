import { GitAmendCommit, GitCommit, GitCommitChecked } from "../bridge/commands";

/** A commit a git hook stopped (git_commit_checked in githook.rs). */
export interface HookFailure {
  /** The hook's name as git calls it: "pre-commit", "commit-msg". */
  hook: string;
  /** What it found in a few words, when its output says. */
  summary: string | null;
  /** What it printed, without colours. */
  output: string;
  /** The picked files the hook rewrote (a formatter) and left unstaged. */
  changed: string[];
}

export interface CommitRequest {
  cwd: string;
  message: string;
  files: string[];
  /** The last commit's hash, to amend it instead of committing anew. */
  amend?: string | null;
  /** `--no-verify`: only ever from the hook panel's Commit without hooks. */
  skipHooks?: boolean;
}

const PREVIEW_LINES = 6;
const PROMPT_FILES = 30;
const PROMPT_LINES = 120;

// A paired computer on an older lpm has no git_commit_checked, and commits
// the way it did before: a hook's output is then a plain error.
function missingCommand(err: unknown): boolean {
  const text = String(err);
  return text.includes("git_commit_checked") && /not found|unknown/i.test(text);
}

/** Commit (or amend): null once it's made, the hook's report when a hook
 *  stopped it. Any other failure throws. */
export async function commitChecked(req: CommitRequest): Promise<HookFailure | null> {
  try {
    const failure = await GitCommitChecked(req.cwd, req.message, req.files, req.amend ?? null, req.skipHooks ?? false);
    return failure ?? null;
  } catch (err) {
    if (req.skipHooks || !missingCommand(err)) throw err;
    if (req.amend) await GitAmendCommit(req.cwd, req.message, req.files, req.amend);
    else await GitCommit(req.cwd, req.message, req.files);
    return null;
  }
}

export function hookHeadline(failure: HookFailure): string {
  return `The ${failure.hook} hook stopped this commit`;
}

export function outputLineCount(output: string): number {
  return output ? output.split("\n").length : 0;
}

// lint-staged's and listr's progress rows, and a hook manager's own exit line.
const NOISE = /^\s*(\[(STARTED|COMPLETED|SKIPPED|SUCCESS|TITLE)\]|husky - |hint: )/;
const FINDING = /error|warning|✖|×|failed|\d+:\d+/i;

/** The lines the folded output shows: the ones that report something, else
 *  the last few. */
export function outputPreview(output: string): string[] {
  const lines = output.split("\n").filter((line) => line.trim() && !NOISE.test(line));
  const findings = lines.filter((line) => FINDING.test(line));
  return (findings.length > 0 ? findings.slice(0, PREVIEW_LINES) : lines.slice(-PREVIEW_LINES));
}

/** The Try again button: after a formatter hook, the files it fixed go in too. */
export function retryLabel(failure: HookFailure): string {
  const n = failure.changed.length;
  if (n === 0) return "Try again";
  return `Add the ${n === 1 ? "file" : `${n} files`} it changed and commit`;
}

function fileList(files: string[]): string {
  const shown = files.slice(0, PROMPT_FILES).map((f) => `- ${f}`);
  if (files.length > PROMPT_FILES) shown.push(`- and ${files.length - PROMPT_FILES} more`);
  return shown.join("\n");
}

/** What an agent asked to fix a hook's findings is told: the commit it
 *  stopped, what it printed, and to commit again with the hook running. */
export function commitHookPrompt(
  failure: HookFailure,
  commit: { message: string; files: string[]; amend?: boolean },
): string {
  const subject = commit.message.trim().split("\n")[0] ?? "";
  const what = commit.amend ? "amend the last commit" : "commit";
  const found = failure.summary ? ` It found: ${failure.summary}.` : "";
  const output = failure.output.split("\n").slice(-PROMPT_LINES).join("\n");
  const next = commit.amend
    ? "Fix what it found and leave the changes uncommitted, so I can amend the commit again."
    : "Fix what it found, then commit the same files again with the same message. Let the hook run: don't skip it with --no-verify.";
  return [
    `I tried to ${what} with the message "${subject}", and the ${failure.hook} hook stopped it.${found} What it printed:`,
    "",
    "```",
    output,
    "```",
    "",
    next,
    ...(commit.files.length > 0 ? ["", "Files in the commit:", fileList(commit.files)] : []),
  ].join("\n");
}
