// The sample data the demo backend serves. Everything a seeded project shows
// (sidebar, header buttons, services, Git, files, open agent tabs) is derived
// from one SeedProject, so no two views of it can disagree.

import type { AICLI, ProfileInfo } from "../../types";

export type AgentKind = AICLI;

export type AgentStep =
  | { kind: "thinking" }
  | { kind: "tool"; label: string; arg: string; result: string }
  | { kind: "text"; text: string; style?: "default" | "muted" };

// A proposal an agent left on the table; answering yes carries it out.
export type ReplyIntent = "fix" | "add" | "refactor" | "docs" | "deploy";

// What an agent knows about the project it runs in, so a Go service doesn't get
// answers about a Next.js app.
export interface ReplyContext {
  manifest: string;
  manifestLines: string;
  readmeLines: string;
  sourceGlob: string;
  sourceMatches: string;
  overview: string;
  flows: string;
  testCmd: string;
  testResult: string;
  testSummary: string;
  focusFile: string;
  focusLines: string;
  focusArea: string;
  hotspotDir: string;
  deployFile: string;
  deployLines: string;
  deployCmd: string;
  draftFile: string;
  wireTarget: string;
}

export type LineColor = "default" | "muted" | "green" | "cyan" | "yellow" | "red" | "magenta";

// One line of output, `at` ms after its command starts.
export interface SeedLine {
  text: string;
  color?: LineColor;
  at: number;
}

export interface SeedService {
  name: string;
  cmd: string;
  port?: number;
  dependsOn?: string[];
  log: SeedLine[];
  // Printed again and again once the log has played, like a dev server's requests.
  loop?: { line: Omit<SeedLine, "at">; everyMs: number };
}

// A turn an agent works through: the prompt and the steps it streams back.
export interface AgentTask {
  prompt: string;
  steps: AgentStep[];
  // Keeps the turn busy after its steps, the way a long task does.
  keepBusy?: boolean;
}

export interface SeedAction {
  name: string;
  label: string;
  emoji?: string;
  color?: string;
  cmd: string;
  // "" is the header, "footer" the row by the branch switcher, anything else
  // the zone of that name.
  display: string;
  // "terminal" opens a tab running cmd, "background" runs it behind a progress
  // card, "command" types it into the focused terminal; "" runs it and shows
  // its output.
  type: "terminal" | "background" | "command" | "";
  confirm?: boolean;
  // As a config sets them; seeded buttons keep the order they're declared in.
  position?: number;
  layer?: string;
  primary?: string;
  reuse?: boolean;
  prompt?: string;
  cwd?: string;
  env?: Record<string, string>;
  children?: SeedAction[];
  output?: SeedLine[];
  durationMs?: number;
  // For an agent action: the task this project's tour types into it, and the
  // reply that prompt gets.
  task?: AgentTask;
}

export type SeedProfile = ProfileInfo;

export interface SeedBranch {
  name: string;
  // "origin" for a remote-tracking branch.
  remote?: string;
  ageMs: number;
}

export interface SeedChange {
  path: string;
  status: "modified" | "added" | "deleted";
  // The file at HEAD ("" when added) and in the working tree ("" when deleted).
  original: string;
  modified: string;
}

export interface SeedGit {
  branch: string;
  upstream: boolean;
  ahead: number;
  behind: number;
  branches: SeedBranch[];
  changes: SeedChange[];
}

// An agent tab already open when the project is first shown.
export interface SeedSession {
  kind: AgentKind;
  task: AgentTask;
  state: "done" | "waiting";
  // How long ago the turn started ("done": how long it took).
  ageMs: number;
  // For "waiting": what answering it carries out.
  answer?: { intent?: ReplyIntent; steps: AgentStep[] };
}

export interface SeedProject {
  name: string;
  label?: string;
  root: string;
  services: SeedService[];
  actions: SeedAction[];
  profiles: SeedProfile[];
  git: SeedGit;
  // Every file by path from the root. Changed files hold their working-tree text.
  files: Record<string, string>;
  reply: ReplyContext;
  session?: SeedSession;
}

// A folder the Local Folder picker can hand out, and what lpm detects in it.
export interface SeedFolder {
  name: string;
  files: Record<string, string>;
  services: SeedService[];
  actions?: SeedAction[];
  profiles?: SeedProfile[];
  git?: SeedGit;
  reply?: ReplyContext;
}

export interface SeedSshHost {
  alias: string;
  host: string;
  user: string;
  port: number;
}

export interface Seed {
  projects: SeedProject[];
  // Handed out in turn by Local Folder, after the ones a tour asks for.
  folders: SeedFolder[];
  sshHosts: SeedSshHost[];
  // Shapes the Automations, Usage and Stats views read, as the real commands
  // return them.
  jobs: unknown[];
  // `job_history` by job id.
  jobHistory?: Record<string, unknown[]>;
  usage: { limits: unknown; accountsStatus?: unknown; accountUsage: unknown };
  // `omit` leaves projects out of the breakdowns, as a tour leaves them out of the sidebar.
  stats: (days: number, omit?: readonly string[]) => unknown;
  // The recap of the week or month starting `week`, as `weekly_recap` returns it.
  recap: (week: string, period: "week" | "month") => unknown;
}
