import {
  CLAUDE_ACTION,
  CODEX_ACTION,
  type DemoAction,
  type DemoGit,
  type DemoProject,
  type OutputLine,
  type ReplyContext,
} from "./projects";
import { initialPaneState, type ActionTerminalMap } from "./project-view";
import type { PaneNode } from "./pane-tree";
import type { NewActionInput } from "./add-action-modal";
import type { NewProjectInput } from "./add-project-modal";
import type { AgentStep } from "./agent-script";
import { servicesFor } from "./detected-services";

// What the agent in a fresh copy picks up, so the duplicate is visibly doing
// its own work rather than mirroring its parent.
export const DUPLICATE_PROMPT =
  "Try the same change with a background job instead";

// How long the sessions a visitor has not opened yet claim to have been going,
// so their rows read like work already under way rather than starting now. The
// ages live with the transcript that has to honour them: a row and the session
// it opens are the same clock, and neither may jump when the other appears.
export { SEEDED_AGENT_AGE_MS } from "./agent-terminal";

// The copy's opening turn, named in the source project's own files. Built here
// rather than through buildReply, whose replies all stop on a question — a
// duplicate has to look like a second agent working, not one asking. It only
// inspects: a copy is created with a clean tree, so a claimed edit would be a
// change the visitor can open the Review tab and fail to find.
//
// The turn keeps going through keepAliveSteps, so it hands over rather than
// finishing: it says what it is about to read before reading it, and ends on
// the test run that keepAliveSteps opens with. Nothing here runs a command it
// leaves hanging, and nothing repeats a step that comes later.
export function duplicateSteps(
  ctx: ReplyContext | undefined,
): AgentStep[] | undefined {
  if (!ctx) return undefined;
  return [
    { kind: "thinking" },
    {
      kind: "text",
      text: `Queuing it through ${ctx.wireTarget} instead would let the caller return straight away. Reading ${ctx.focusArea} first to see what calls it today.`,
    },
    { kind: "tool", label: "Read", arg: ctx.focusFile, result: ctx.focusLines },
    { kind: "tool", label: "Read", arg: ctx.manifest, result: ctx.manifestLines },
    {
      kind: "text",
      text: `The call path is synchronous end to end, and nothing here queues work yet. Running ${ctx.testCmd} on this copy before I change any of it.`,
    },
  ];
}

// Worktree branches carry the app's own `lpm/` namespace over the copy's name,
// sanitised the way projects_crud.rs sanitises it — never a prefix borrowed
// from whatever branch the source happens to sit on.
export function worktreeBranch(copyName: string): string {
  const component = copyName
    .replace(/[^A-Za-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `lpm/${component || "worktree"}`;
}

export function initialGitState(
  projects: DemoProject[],
): Record<string, DemoGit> {
  const out: Record<string, DemoGit> = {};
  for (const p of projects) {
    if (p.git) out[p.name] = { ...p.git, branches: [...p.git.branches] };
  }
  return out;
}

// A visitor's first frame has to be the product, not an empty room: every
// project boots the way its owner left it — default profile up, agent open.
export function initialRunningState(
  projects: DemoProject[],
): Record<string, Set<string>> {
  return Object.fromEntries(projects.map((p) => [p.name, new Set<string>()]));
}

export function initialTreeState(
  projects: DemoProject[],
): Record<string, PaneNode | null> {
  return Object.fromEntries(
    projects.map((p) => [p.name, initialPaneState(p).tree]),
  );
}

export function initialActionTerminalState(
  projects: DemoProject[],
): Record<string, ActionTerminalMap> {
  return Object.fromEntries(
    projects.map((p) => [p.name, initialPaneState(p).actionTerminals]),
  );
}

export function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function actionOutput(
  cmd: string,
  mode: "once" | "terminal",
): { output: OutputLine[]; loop?: { line: OutputLine; intervalMs: number } } {
  const head: OutputLine = { text: `$ ${cmd}`, color: "green", delay: 50 };
  if (mode === "terminal") {
    return {
      output: [
        head,
        { text: "starting process…", color: "muted", delay: 350 },
        { text: "ready — watching for changes", color: "cyan", delay: 850 },
      ],
      loop: {
        line: { text: "· recompiled in 41ms", color: "muted", delay: 0 },
        intervalMs: 2600,
      },
    };
  }
  return {
    output: [
      head,
      { text: "working…", color: "muted", delay: 350 },
      { text: "✓ done in 0.9s", color: "green", delay: 950 },
    ],
  };
}

export function buildActionFromInput(
  input: NewActionInput,
  existing: DemoAction[],
): DemoAction {
  const taken = new Set(existing.map((a) => a.name));
  const name = uniqueName(slugify(input.name) || "action", taken);
  const { output, loop } = actionOutput(input.cmd, input.runMode);
  return {
    name,
    label: input.name,
    ...(input.emoji ? { emoji: input.emoji } : {}),
    cmd: input.cmd,
    display: "header",
    ...(input.runMode === "terminal" ? { type: "terminal" as const } : {}),
    ...(input.confirm ? { confirm: true } : {}),
    durationMs: 1000,
    output,
    ...(loop ? { loop } : {}),
  };
}

// A new project gets the services the app would write for it — detected from
// the folder, a login shell for an SSH host — while the agent actions come
// from the global config every project shares.
export function buildProjectFromInput(
  input: NewProjectInput,
  existing: DemoProject[],
): DemoProject {
  const taken = new Set(existing.map((p) => p.name));
  const name = uniqueName(input.name, taken);
  const services = servicesFor(input);
  if (input.kind === "ssh") {
    return {
      name,
      label: name,
      root: `ssh://${input.host}/~/${name}`,
      stack: `SSH · ${input.host}`,
      services,
      actions: [CLAUDE_ACTION, CODEX_ACTION],
      profiles: [],
    };
  }
  return {
    name,
    label: name,
    root: `~/Projects/${name}`,
    stack: "Local project",
    services,
    actions: [CLAUDE_ACTION, CODEX_ACTION],
    profiles: [],
  };
}
