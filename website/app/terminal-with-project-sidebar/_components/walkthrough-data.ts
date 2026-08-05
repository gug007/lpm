export type ProjectKey =
  | "checkout"
  | "billing"
  | "auth-hotfix"
  | "marketing-site"
  | "infra";

export type RunState = "running" | "stopped";

export type WalkthroughProject = {
  key: ProjectKey;
  name: string;
  run: RunState;
  /** Only Claude Code and Codex report this. Undefined means no agent state. */
  agent?: "needs-you";
  summary: string;
};

export type WalkthroughSession = {
  id: string;
  project: ProjectKey;
  /** The terminal's own name inside its project. */
  title: string;
  lines: string[];
  /** A command left half-typed at the prompt. */
  draft?: string;
};

export const PROJECTS: WalkthroughProject[] = [
  {
    key: "checkout",
    name: "checkout",
    run: "running",
    summary: "Dev server and API up, Claude Code idle.",
  },
  {
    key: "billing",
    name: "billing",
    run: "stopped",
    summary: "Nothing running right now.",
  },
  {
    key: "auth-hotfix",
    name: "auth-hotfix",
    run: "running",
    agent: "needs-you",
    summary: "Claude Code is waiting on an answer.",
  },
  {
    key: "marketing-site",
    name: "marketing-site",
    run: "stopped",
    summary: "Nothing running right now.",
  },
  {
    key: "infra",
    name: "infra",
    run: "running",
    summary: "An SSH project — same list as the local ones.",
  },
];

export const FOLDER_NAME = "Client work";
export const FOLDER_MEMBERS: ProjectKey[] = ["checkout", "billing"];
export const TOP_LEVEL: ProjectKey[] = [
  "auth-hotfix",
  "marketing-site",
  "infra",
];

/**
 * The same nine sessions the walkthrough shows in both models, in the creation
 * order a flat tab strip would put them in. Switching to the sidebar regroups
 * this list; it never adds to it or removes from it.
 */
export const SESSIONS: WalkthroughSession[] = [
  {
    id: "checkout-web",
    project: "checkout",
    title: "web",
    lines: [
      "$ pnpm dev",
      "  VITE ready in 812 ms",
      "  ➜  Local:   http://localhost:5173/",
    ],
  },
  {
    id: "checkout-api",
    project: "checkout",
    title: "api",
    lines: [
      "$ pnpm --filter api dev",
      "  api listening on :4000",
      "  db pool ready (postgres@local)",
    ],
    draft: 'pnpm test packages/api -- --grep "refund"',
  },
  {
    id: "billing-api",
    project: "billing",
    title: "api",
    lines: ["$ git status", "  On branch invoice-pdf", "  nothing to commit"],
  },
  {
    id: "checkout-claude",
    project: "checkout",
    title: "claude",
    lines: [
      "$ claude",
      "  Reviewed 3 files in packages/api.",
      "  Waiting for your next prompt.",
    ],
  },
  {
    id: "marketing-dev",
    project: "marketing-site",
    title: "dev",
    lines: ["$ npm run build", "  built in 6.4s", "$ "],
  },
  {
    id: "auth-dev",
    project: "auth-hotfix",
    title: "dev",
    lines: [
      "$ pnpm dev",
      "  api listening on :4010",
      "  auth/session.ts reloaded",
    ],
  },
  {
    id: "billing-psql",
    project: "billing",
    title: "psql",
    lines: ["$ psql billing_dev", "  psql (16.2)", "  billing_dev=#"],
  },
  {
    id: "infra-prod",
    project: "infra",
    title: "ssh prod-1",
    lines: [
      "$ ssh prod-1",
      "  Last login: Tue 09:41 from 10.0.0.4",
      "  deploy@prod-1:~$",
    ],
  },
  {
    id: "auth-claude",
    project: "auth-hotfix",
    title: "claude",
    lines: [
      "$ claude",
      "  The session cookie is set twice on refresh.",
      "  Should I drop the legacy cookie? (y/n)",
    ],
  },
];

export const projectByKey = (key: ProjectKey): WalkthroughProject =>
  PROJECTS.find((project) => project.key === key) as WalkthroughProject;

export const sessionsOf = (key: ProjectKey): WalkthroughSession[] =>
  SESSIONS.filter((session) => session.project === key);

/** 1-based position in the flat tab row — the numbers the copy refers to. */
export const tabNumberOf = (id: string): number =>
  SESSIONS.findIndex((session) => session.id === id) + 1;

/** The project's other session; only asked of a project that has two. */
export const otherSessionOf = (
  key: ProjectKey,
  id: string,
): WalkthroughSession =>
  sessionsOf(key).find((session) => session.id !== id) as WalkthroughSession;

export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 260;
