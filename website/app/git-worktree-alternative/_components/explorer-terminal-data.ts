import type { DuplicateOptions } from "./explorer-data";

export type TermLine =
  | { kind: "cmd"; cwd: string; text: string }
  | { kind: "out"; text: string; tone?: "error" | "note" }
  | { kind: "status"; code: string; path: string }
  | { kind: "prompt"; cwd: string };

const cmd = (cwd: string, text: string): TermLine => ({ kind: "cmd", cwd, text });
const out = (text = ""): TermLine => ({ kind: "out", text });
const error = (text: string): TermLine => ({ kind: "out", text, tone: "error" });

export const TERMINAL_TITLE = "~/Projects/shop";

// Every line matches what Git 2.50 and npm 11 print for this setup; only the
// commit hash and message are made up.
export const WORKTREE_TERMINAL: TermLine[] = [
  cmd("shop", "git worktree add ../shop-2 main"),
  out("Preparing worktree (checking out 'main')"),
  error("fatal: 'main' is already used by worktree at '/Users/you/Projects/shop'"),
  cmd("shop", "git worktree add -b try-2 ../shop-2"),
  out("Preparing worktree (new branch 'try-2')"),
  out("HEAD is now at 8c2f4a1 Add pricing page"),
  cmd("shop", "cd ../shop-2 && npm run dev"),
  out(),
  out("> shop@0.1.0 dev"),
  out("> next dev"),
  out(),
  error("sh: next: command not found"),
  { kind: "prompt", cwd: "shop-2" },
];

const COPY = "shop-k3Fq9Z";

const LISTING = [
  ".                       node_modules",
  "..                      notes",
  ".env                    package-lock.json",
  ".git                    package.json",
  ".gitignore              src",
  "next.config.ts",
];

const LISTING_COMMITTED_ONLY = [
  ".                       next.config.ts",
  "..                      node_modules",
  ".env                    package-lock.json",
  ".git                    package.json",
  ".gitignore              src",
];

export function duplicateTerminal({ committedOnly }: DuplicateOptions): TermLine[] {
  const status: TermLine[] = committedOnly
    ? [{ kind: "out", text: "(no output: the working tree is clean)", tone: "note" }]
    : [
        { kind: "status", code: " M", path: "src/billing/trial.ts" },
        { kind: "status", code: "??", path: "notes/" },
      ];
  return [
    cmd("shop", `cd ../${COPY}`),
    cmd(COPY, "git branch --show-current"),
    out("main"),
    cmd(COPY, "git status --short"),
    ...status,
    cmd(COPY, "ls -a"),
    ...(committedOnly ? LISTING_COMMITTED_ONLY : LISTING).map((line) => out(line)),
    { kind: "prompt", cwd: COPY },
  ];
}
