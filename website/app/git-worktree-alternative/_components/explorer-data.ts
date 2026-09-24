import {
  DEFAULT_OPTIONS,
  OPTION_ROWS,
  type DuplicateOptions,
  type OptionKey,
} from "./dialog-data";

export { DEFAULT_OPTIONS, type DuplicateOptions, type OptionKey };

export const DUPLICATE_OPTIONS = OPTION_ROWS.map(
  ({ key, title, icon, description }) => ({
    key,
    title,
    icon,
    description: description("the copy"),
  }),
);

export type DuplicateOption = (typeof DUPLICATE_OPTIONS)[number];

export const isDefault = (options: DuplicateOptions) =>
  DUPLICATE_OPTIONS.every(({ key }) => options[key] === DEFAULT_OPTIONS[key]);

export type ItemState = "present" | "differs" | "missing" | "rebuilt";

export type ItemKind =
  | "repo"
  | "pointer"
  | "branch"
  | "code"
  | "text"
  | "secret"
  | "package"
  | "folder";

export type ItemCell = {
  state: ItemState;
  reason: string;
  name?: string;
  kind?: ItemKind;
};

export type ExplorerRow = {
  id: string;
  name: string;
  kind: ItemKind;
  tag?: string;
  worktree: ItemCell;
  todo?: string;
  duplicate: (options: DuplicateOptions) => ItemCell;
};

export const STATE_LABEL: Record<ItemState, string> = {
  present: "Comes along",
  differs: "Different from shop",
  missing: "Missing",
  rebuilt: "Rebuilt on the next run",
};

export const WORKTREE_FOLDER = "shop-2/";
export const WORKTREE_COMMAND = "git worktree add -b try-2 ../shop-2";
export const DUPLICATE_FOLDER = "shop-k3Fq9Z/";

export const EXPLORER_ROWS: ExplorerRow[] = [
  {
    id: "git",
    name: ".git",
    kind: "repo",
    worktree: {
      state: "differs",
      kind: "pointer",
      reason: "a file pointing back at shop's repository",
    },
    duplicate: () => ({
      state: "present",
      name: ".git/",
      reason: "its own repository; stale worktree entries removed",
    }),
  },
  {
    id: "branch",
    name: "branch",
    kind: "branch",
    worktree: {
      state: "differs",
      name: "try-2",
      reason: "a new branch, because main is already checked out in shop",
    },
    duplicate: ({ pullLatest }) => ({
      state: "present",
      name: "main",
      reason: pullLatest
        ? "same branch as shop; tries to fast-forward to the newest commits"
        : "same branch as shop, at the commit you're on",
    }),
  },
  {
    id: "trial",
    name: "src/billing/trial.ts",
    kind: "code",
    tag: "modified",
    worktree: {
      state: "differs",
      reason: "the committed version; your edit isn't there",
    },
    duplicate: ({ committedOnly }) =>
      committedOnly
        ? { state: "differs", reason: "the committed version; your edit stays in shop" }
        : { state: "present", reason: "your uncommitted edit" },
  },
  {
    id: "notes",
    name: "notes/todo.md",
    kind: "text",
    tag: "untracked",
    worktree: { state: "missing", reason: "not in Git, so never checked out" },
    duplicate: ({ committedOnly }) =>
      committedOnly
        ? { state: "missing", reason: "removed with the other untracked files" }
        : { state: "present", reason: "copied" },
  },
  {
    id: "env",
    name: ".env",
    kind: "secret",
    tag: "ignored",
    worktree: { state: "missing", reason: "ignored by Git, so never checked out" },
    todo: "copy .env",
    duplicate: ({ committedOnly }) => ({
      state: "present",
      reason: committedOnly
        ? "still copied: Committed work only keeps ignored files"
        : "copied",
    }),
  },
  {
    id: "deps",
    name: "node_modules/",
    kind: "package",
    tag: "ignored",
    worktree: { state: "missing", reason: "not there; run npm install" },
    todo: "run npm install",
    duplicate: ({ reinstall }) => ({
      state: "present",
      reason: reinstall
        ? "left out of the copy, then installed fresh"
        : "copied as a copy-on-write clone",
    }),
  },
  {
    id: "next",
    name: ".next/",
    kind: "folder",
    tag: "build cache",
    worktree: { state: "rebuilt", reason: "not checked out; rebuilt on the next run" },
    duplicate: () => ({ state: "rebuilt", reason: "left behind; rebuilt on the next run" }),
  },
];

const sentence = (parts: string[]) => {
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

const WORKTREE_TODOS = EXPLORER_ROWS.flatMap((row) => (row.todo ? [row.todo] : []));

export const WORKTREE_SUMMARY = {
  title: `${WORKTREE_TODOS.length} things to set up by hand, once per worktree`,
  detail: `${sentence(WORKTREE_TODOS)} Your uncommitted edit and notes/todo.md stay in shop.`,
};

export function duplicateSummary(options: DuplicateOptions) {
  const start = options.committedOnly
    ? "Starts from the last commit, with .env still in place."
    : "Starts where you left off, uncommitted edit included.";
  const deps = options.reinstall
    ? "Dependencies install fresh in the copy."
    : "Dependencies are already installed.";
  return { title: "Nothing to copy or install by hand", detail: `${start} ${deps}` };
}

const ANNOUNCEMENTS: Record<OptionKey, { on: string; off: string }> = {
  committedOnly: {
    on: "Committed work only on: the copy resets to the last commit and drops notes/todo.md. .env and node_modules still come along.",
    off: "Committed work only off: your uncommitted edit and notes/todo.md come along.",
  },
  pullLatest: {
    on: "Pull latest changes on: the copy tries to fast-forward main to the newest commits.",
    off: "Pull latest changes off: the copy stays at the commit you're on.",
  },
  reinstall: {
    on: "Reinstall dependencies on: node_modules is left out, then installed fresh in the copy.",
    off: "Reinstall dependencies off: node_modules comes along as a copy-on-write clone.",
  },
};

export const announce = (key: OptionKey, on: boolean) =>
  on ? ANNOUNCEMENTS[key].on : ANNOUNCEMENTS[key].off;

export const RESET_ANNOUNCEMENT =
  "Duplicate options back to the dialog's defaults: Pull latest changes on, the other two off.";
