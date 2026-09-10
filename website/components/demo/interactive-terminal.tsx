"use client";

import { useEffect, useRef, useState } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { useStickToBottom } from "./use-stick-to-bottom";
import PROJECTS, { type ChangedFile, type DemoGit } from "./projects";

const MAX_TERMINAL_HISTORY = 200;

const NOT_A_REPO =
  "fatal: not a git repository (or any of the parent directories): .git";

// One listing per project so the Go service does not answer `ls` with
// package.json. Each one has to name every path the project's own transcripts
// read, its actions run, and its services load — a visitor who finds a file the
// agent read missing from `ls` has caught the demo out. The global Terminals
// view has no project and lists a home.
const DEFAULT_LISTING = "README.md  package.json  src/  scripts/  tests/";
const HOME_LISTING = "Applications  Desktop  Downloads  Projects  go  bin";

const LISTINGS: Record<string, string> = {
  "saas-app":
    "Gemfile  package.json  README.md  app/  bin/  db/  scripts/  src/",
  "auth-service":
    "docker-compose.yml  go.mod  go.sum  Makefile  README.md  cmd/  internal/  k8s/",
  "docs-site":
    "astro.config.mjs  package.json  README.md  vercel.json  public/  src/",
  "ml-pipeline":
    "Makefile  pyproject.toml  README.md  data/  notebooks/  pipeline/  runs/",
  "mobile-app":
    "app.json  App.tsx  eas.json  index.ts  package.json  README.md  tsconfig.json  android/  ios/  src/",
};

// `git log` is the second thing anyone types in a shell, so each project
// answers with its own branch's history rather than a shared placeholder.
const DEFAULT_LOG = [
  "7c1e5b8 chore: tidy up the local dev setup",
  "2f9a4d1 fix: stop the dev port from drifting between runs",
  "a13c6e0 docs: note the env vars a fresh clone needs",
];

const LOGS: Record<string, string[]> = {
  "saas-app": [
    "9f3c1ab feat(billing): read plan prices from one table",
    "4d81e07 test(billing): cover checkout with a trial coupon",
    "b6a2f55 chore(deps): bump stripe to 14.2.0",
  ],
  "auth-service": [
    "c41e9d2 refactor(auth): move jwt rotation into its own package",
    "7b0af38 fix(redis): reuse the session pool across requests",
    "2e59c14 chore(ci): run go vet on every push",
  ],
  "docs-site": [
    "a7d24f1 docs(api): split the authentication page for v2",
    "5c8e930 feat(nav): group the guides under one sidebar section",
    "31bd6a8 chore(astro): move to the 5.2 content collections API",
  ],
  "ml-pipeline": [
    "d92f4c6 feat(features): clip amounts at a robust quantile",
    "8a13e07 perf(loader): stream parquet shards instead of a full read",
    "6f47b21 chore(env): pin torch to 2.6.1",
  ],
  "mobile-app": [
    "b8f0c25 feat(plans): show the annual price on the plans screen",
    "3ad7e91 fix(session): keep the refresh token in SecureStore",
    "e5c40b3 chore(ios): regenerate the native project after the config change",
  ],
};

const STATUS_LABEL: Record<ChangedFile["status"], string> = {
  modified: "modified:",
  added: "new file:",
  deleted: "deleted:",
};

const COMMIT_VERB: Record<ChangedFile["status"], string> = {
  modified: "update",
  added: "add",
  deleted: "remove",
};

// Conventional-commit types a branch name can carry, so a commit made on
// `docs/api-v2` is written up the way its neighbours in the log are.
const BRANCH_TYPES = ["feat", "fix", "docs", "chore", "refactor", "perf", "test"];

const commits = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
const fileCount = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

// A duplicate is named `<source>-2` and a worktree `<source>-wt`, either of
// which can pick up a further `-2` when the name is taken. All of them start as
// a copy of the same tree, so they answer `ls` and `git log` the way the source
// they were cut from does.
const sourceOf = (projectName: string) =>
  projectName.replace(/(?:-(?:\d+|wt))+$/, "");

type SessionCommit = { hash: string; subject: string; branch: string };

// What the visitor committed while the demo was open. The seeded LOGS above are
// only the tail of the history, so a commit made here has to sit on top of them
// or `git log` ends up denying what `git status` and the branch pill both show.
// It is kept per project outside React so a shell opened after the commit still
// has it, and so two shells in one project can never disagree.
const sessionCommits = new Map<string, SessionCommit[]>();
const lastSeenGit = new Map<string, { ahead: number; uncommitted: number }>();

const seedGit = (projectName: string) =>
  PROJECTS.find((p) => p.name === sourceOf(projectName))?.git;

/** Seven hex characters, the way `git log --oneline` abbreviates. */
function shortHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

// The visitor never types a message, so the subject is written from the diff
// that just left the working tree: what happened to which files.
function commitSubject(
  branch: string,
  files: ChangedFile[],
  count: number,
): string {
  const prefix = branch.split("/")[0];
  const type = BRANCH_TYPES.includes(prefix)
    ? prefix
    : files.some((f) => f.status === "added")
      ? "feat"
      : "fix";
  const groups = (["added", "modified", "deleted"] as const)
    .map((status) => ({
      verb: COMMIT_VERB[status],
      names: files
        .filter((f) => f.status === status)
        .map((f) => f.path.split("/").pop() ?? f.path),
    }))
    .filter((g) => g.names.length > 0);
  if (groups.length === 0) return `${type}: update ${fileCount(count)}`;
  const body = groups
    .map((g) =>
      g.names.length > 2
        ? `${g.verb} ${fileCount(g.names.length)}`
        : `${g.verb} ${g.names.join(" and ")}`,
    )
    .join(", ");
  return `${type}: ${body}`;
}

function trackCommits(
  projectName: string,
  git: DemoGit,
  files: ChangedFile[],
): void {
  const seed = seedGit(projectName);
  const prev = lastSeenGit.get(projectName) ?? seed;
  lastSeenGit.set(projectName, {
    ahead: git.ahead,
    uncommitted: git.uncommitted,
  });
  // A remounted demo starts over from the seed, so anything remembered from the
  // last run would be a commit the branch pill has no count for.
  if (
    seed &&
    git.branch === seed.branch &&
    git.ahead === seed.ahead &&
    git.uncommitted === seed.uncommitted
  ) {
    sessionCommits.delete(projectName);
    return;
  }
  if (!prev) return;
  // Only committing both empties the working tree and adds to what the branch
  // is ahead by: discarding leaves the count alone, pushing leaves the tree.
  const committed =
    git.ahead > prev.ahead && prev.uncommitted > 0 && git.uncommitted === 0;
  if (!committed) return;
  const previous = sessionCommits.get(projectName) ?? [];
  const subject = commitSubject(git.branch, files, prev.uncommitted);
  sessionCommits.set(projectName, [
    {
      hash: shortHash(`${projectName}${git.branch}${subject}${previous.length}`),
      subject,
      branch: git.branch,
    },
    ...previous,
  ]);
}

function gitStatus(git: DemoGit, files: ChangedFile[]): string {
  const lines = [`On branch ${git.branch}`];
  const upstream = git.upstream ? `'${git.upstream}/${git.branch}'` : null;
  if (upstream && git.ahead > 0 && git.behind > 0) {
    lines.push(
      `Your branch and ${upstream} have diverged,`,
      `and have ${git.ahead} and ${git.behind} different commits each, respectively.`,
    );
  } else if (upstream && git.ahead > 0) {
    lines.push(`Your branch is ahead of ${upstream} by ${commits(git.ahead)}.`);
  } else if (upstream && git.behind > 0) {
    lines.push(
      `Your branch is behind ${upstream} by ${commits(git.behind)}, and can be fast-forwarded.`,
    );
  }
  lines.push("");
  if (files.length === 0) {
    lines.push("nothing to commit, working tree clean");
    return lines.join("\n");
  }
  lines.push(
    "Changes not staged for commit:",
    '  (use "git add <file>..." to update what will be committed)',
    ...files.map((f) => `\t${STATUS_LABEL[f.status]}   ${f.path}`),
    "",
    'no changes added to commit (use "git add" and/or "git commit -a")',
  );
  return lines.join("\n");
}

export function InteractiveTerminal({
  projectRoot,
  projectName,
  git,
  changedFiles,
}: {
  projectRoot: string;
  projectName?: string;
  // Live git state, not the project seed: after a commit the shell has to
  // agree with the branch pill two inches below it.
  git?: DemoGit;
  changedFiles?: ChangedFile[];
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    { prompt: string; input: string; output: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([
    history,
  ]);

  // A shell you just opened should take what you type. Only when the click that
  // opened it came from inside the demo, so a pane mounted for a project the
  // visitor is not looking at never steals the page's focus — and never with a
  // scroll, which would shove the page under them.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest(".replica-ui")) return;
    input.focus({ preventScroll: true });
  }, []);

  // Watched here rather than at the commit itself: the shell is the only place
  // the history is read, and a pane that was closed when the visitor committed
  // still picks the commit up when it mounts.
  useEffect(() => {
    if (!projectName || !git) return;
    trackCommits(projectName, git, changedFiles ?? []);
  }, [projectName, git, changedFiles]);

  const rel = projectRoot.replace(/^~\/?/, "");
  const prompt = rel ? `~/${rel} $ ` : `~ $ `;

  const fakeRun = (cmd: string): string => {
    const trimmed = cmd.trim();
    if (!trimmed) return "";
    if (trimmed === "ls") {
      if (!projectName) return HOME_LISTING;
      return LISTINGS[sourceOf(projectName)] ?? DEFAULT_LISTING;
    }
    if (trimmed === "pwd") return projectRoot;
    if (trimmed === "git" || trimmed.startsWith("git ")) {
      if (!git) return NOT_A_REPO;
      if (trimmed === "git status") {
        const files = git.uncommitted > 0 ? changedFiles ?? [] : [];
        return gitStatus(git, files);
      }
      if (trimmed === "git log" || trimmed.startsWith("git log ")) {
        const seeded = projectName ? LOGS[sourceOf(projectName)] : undefined;
        const mine = (projectName ? sessionCommits.get(projectName) ?? [] : [])
          .filter((c) => c.branch === git.branch)
          .map((c) => `${c.hash} ${c.subject}`);
        return [...mine, ...(seeded ?? DEFAULT_LOG)].join("\n");
      }
      return "demo shell · git status and git log are wired up here";
    }
    if (trimmed === "whoami") return "demo";
    if (trimmed === "date") return new Date().toString();
    if (trimmed === "clear") return "__clear__";
    if (trimmed.startsWith("echo ")) return trimmed.slice(5);
    if (trimmed === "help") {
      return [
        "demo shell · try:",
        "  ls          list files",
        "  git status  working tree status",
        "  git log     recent commits",
        "  whoami      current user",
        "  echo X      print X",
        "  clear       clear terminal",
      ].join("\n");
    }
    return `zsh: command not found: ${trimmed.split(" ")[0]}`;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out = fakeRun(input);
    if (out === "__clear__") {
      setHistory([]);
    } else {
      setHistory((h) => {
        const next = [...h, { prompt, input, output: out }];
        return next.length > MAX_TERMINAL_HISTORY
          ? next.slice(-MAX_TERMINAL_HISTORY)
          : next;
      });
    }
    setInput("");
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.3] bg-[#1a1a1a] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[#60a5fa]"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="text-[#919191]">
        lpm demo · try{" "}
        <span className="text-[#4ade80]">ls</span>,{" "}
        <span className="text-[#4ade80]">git status</span>,{" "}
        <span className="text-[#4ade80]">help</span>
      </div>
      {history.map((h, i) => (
        <div key={i}>
          <div className="text-[#cccccc] whitespace-pre-wrap break-all">
            <span className="text-[#22d3ee]">{h.prompt}</span>
            {h.input}
          </div>
          {h.output && (
            <div className="text-[#b3b3b3] whitespace-pre-wrap">{h.output}</div>
          )}
        </div>
      ))}
      <form onSubmit={onSubmit} autoComplete="off" className="flex items-center text-[#cccccc]">
        <span className="text-[#22d3ee] whitespace-pre">{prompt}</span>
        {/* The indicator lives on the pane, not here: a text input matches
            :focus-visible however it was focused, so a ring on the command line
            is the shell's resting look — and a box around the prompt reads as a
            web form. The caret is what a terminal shows. */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          {...NO_AUTOFILL}
          aria-label="Demo shell command"
          className="flex-1 bg-transparent text-[#cccccc] font-mono caret-[#cccccc] outline-none"
        />
      </form>
    </div>
  );
}
