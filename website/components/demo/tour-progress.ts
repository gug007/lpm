import type { ActionTerminalMap, AgentTabState } from "./project-view";
import { collectLeaves, tabKey, type PaneLeaf, type PaneNode } from "./pane-tree";
import type { DemoGit, DemoProject } from "./projects";
import type {
  CopyMode,
  TourAction,
  TourAgent,
  TourStep,
  TourStepId,
} from "./tour";
import type { DemoView } from "./views";

// What the frame holds right now, read by the step list to count what has
// happened and by the tour to skip what already has.
export type TourSnapshot = {
  projects: DemoProject[];
  selected: string;
  view: DemoView;
  running: Record<string, ReadonlySet<string>>;
  trees: Record<string, PaneNode | null>;
  terminals: Record<string, ActionTerminalMap>;
  statuses: Record<string, Record<string, AgentTabState>>;
  git: Record<string, DemoGit>;
  // Things that happened and left nothing behind to read them off — an action
  // that ran in a dialog, a service switched off and on again — and how many
  // times each has.
  events: ReadonlyMap<string, number>;
};

// Where a step acts, as far as the tour can tell ahead of time: the project it
// works on, and for a step that opens one, which visit to it this is — a tour
// that leaves a project and comes back opens it twice.
export type StepBinding = { at?: string; visit: number };

export const tourEvent = {
  added: (kind: string) => `added:${kind}`,
  opened: (project: string) => `opened:${project}`,
  copied: (mode: CopyMode) => `copied:${mode}`,
  ran: (project: string, action: string) => `ran:${project}:${action}`,
  stopped: (project: string, service: string) => `stopped:${project}:${service}`,
  restarted: (project: string, service: string) =>
    `restarted:${project}:${service}`,
  typed: (project: string, command: string) => `typed:${project}:${command}`,
  committed: (project: string) => `committed:${project}`,
};

const NO_SERVICES: ReadonlySet<string> = new Set();

const happened = (s: TourSnapshot, event: string, times = 1) =>
  (s.events.get(event) ?? 0) >= times;

function leavesOf(s: TourSnapshot, project: string): PaneLeaf[] {
  return collectLeaves(s.trees[project] ?? null);
}

// The agent tabs open in a project, and whether each has been given a turn — an
// agent waiting on its first prompt reports no status at all.
function agentTabs(s: TourSnapshot, project: string, agent: TourAgent) {
  const terminals = s.terminals[project] ?? {};
  const statuses = s.statuses[project] ?? {};
  return leavesOf(s, project).flatMap((leaf) =>
    leaf.tabs.flatMap((tab) =>
      tab.kind === "action" && terminals[tab.key]?.agent === agent
        ? [{ tab, status: statuses[tabKey(tab)]?.status }]
        : [],
    ),
  );
}

export function hasAgentTab(
  s: TourSnapshot,
  project: string,
  agent: TourAgent,
): boolean {
  return agentTabs(s, project, agent).length > 0;
}

function activeTabs(s: TourSnapshot, project: string) {
  return leavesOf(s, project).map((leaf) => leaf.tabs[leaf.activeTabIdx]);
}

function sameSet(a: ReadonlySet<string>, b: string[]): boolean {
  return a.size === b.length && b.every((name) => a.has(name));
}

// Follows the tour to bind each step: a step that names no project works on
// whichever the steps before it left on screen. Unknown after a copy, whose
// name the frame picks.
export function bindTour(
  steps: TourAction[],
  opening: string,
): StepBinding[] {
  let at: string | undefined = opening;
  const visits = new Map<string, number>();
  return steps.map((step) => {
    switch (step.id) {
      case "openProject":
      case "openAgent": {
        const visit = (visits.get(step.project) ?? 0) + 1;
        visits.set(step.project, visit);
        at = step.project;
        return { at, visit };
      }
      case "answer":
        at = step.project;
        return { at, visit: 0 };
      case "addProject":
        at = step.folder;
        return { visit: 0 };
      case "addSshHost":
        at = step.host;
        return { visit: 0 };
      case "copy":
        at = undefined;
        return { visit: 0 };
      default:
        return { at, visit: 0 };
    }
  });
}

// Whether a step has happened, whoever did it, in the project it acts on — so
// a step landed before the tour moved elsewhere still reads as done after.
// The project a binding names, as the frame holds it: by name, or — for a
// folder or host the tour adds — by the root it was added at, whatever the
// visitor called it.
export function resolveProject(
  s: TourSnapshot,
  at: string | undefined,
): string | undefined {
  if (!at) return undefined;
  return (
    s.projects.find((p) => p.name === at)?.name ??
    s.projects.find(
      (p) => p.root === `~/Projects/${at}` || p.root.startsWith(`ssh://${at}/`),
    )?.name
  );
}

export function stepDone(
  step: TourAction,
  s: TourSnapshot,
  bound: StepBinding = { visit: 1 },
): boolean {
  const here = resolveProject(s, bound.at) ?? s.selected;
  const running = s.running[here] ?? NO_SERVICES;
  const project = s.projects.find((p) => p.name === here);
  switch (step.id) {
    // Adding a folder of its own is what the rest of the tour builds on, so
    // another folder the visitor added does not stand in for it.
    case "addProject":
      return step.folder
        ? s.projects.some((p) => p.root === `~/Projects/${step.folder}`)
        : happened(s, tourEvent.added("local"));
    case "addSshHost":
      return s.projects.some((p) => p.root.startsWith(`ssh://${step.host}/`));
    case "start":
      return running.size > 0;
    case "agent":
      return agentTabs(s, here, "claude").length > 0;
    case "prompt":
      return agentTabs(s, here, "claude").some((t) => t.status);
    case "codex":
      return agentTabs(s, here, "codex").length > 0;
    case "codexPrompt":
      return agentTabs(s, here, "codex").some((t) => t.status);
    case "openProject":
      return happened(s, tourEvent.opened(step.project), bound.visit);
    case "openAgent":
      return (
        happened(s, tourEvent.opened(step.project), bound.visit) &&
        agentTabs(s, step.project, step.agent).length > 0
      );
    case "answer":
      return agentTabs(s, step.project, step.agent).some(
        (t) => t.status && t.status !== "waiting",
      );
    case "startProfile": {
      const profile = project?.profiles.find((p) => p.name === step.profile);
      return !!profile && sameSet(running, profile.services);
    }
    case "toggleService":
      return step.on
        ? running.has(step.service)
        : !running.has(step.service) && running.size > 0;
    case "restartService":
      return happened(s, tourEvent.restarted(here, step.service));
    case "serviceTab":
      return activeTabs(s, here).some(
        (tab) => tab?.kind === "service" && tab.name === step.service,
      );
    case "preview":
      return leavesOf(s, here).some((leaf) =>
        leaf.tabs.some(
          (tab) =>
            tab.kind === "browser" &&
            tab.url === `http://localhost:${step.port}`,
        ),
      );
    case "shell":
      return happened(s, tourEvent.typed(here, step.command));
    case "review":
      return leavesOf(s, here).some((leaf) =>
        leaf.tabs.some((tab) => tab.kind === "review"),
      );
    case "commit":
      return happened(s, tourEvent.committed(here));
    case "checkout":
      return s.git[here]?.branch === step.branch;
    case "runAction":
      return happened(s, tourEvent.ran(here, step.action));
    case "copy":
      return happened(s, tourEvent.copied(step.mode));
  }
}

// The steps that have happened, in order, whoever did them: the stage only
// moves forward, and a step counts once every step before it has.
export function reachedStage(
  steps: TourStep[],
  bindings: StepBinding[],
  stage: number,
  snapshot: TourSnapshot,
): number {
  let reached = stage;
  while (
    reached < steps.length &&
    stepDone(steps[reached], snapshot, bindings[reached])
  )
    reached += 1;
  return reached;
}

// Steps that boot the project on screen, which a visitor taking over still
// gets, so the demo never sits empty.
const BOOTS = new Set<TourStepId>(["start", "startProfile"]);
// Steps that move the tour onto another project.
const MOVES_PROJECT = new Set<TourStepId>([
  "addProject",
  "addSshHost",
  "openProject",
  "openAgent",
  "copy",
]);

// The step that boots the project the frame opens on, when nothing before it
// moves the tour elsewhere; -1 when there is none.
export function openingBootIndex(steps: TourAction[]): number {
  const at = steps.findIndex(
    (step) => BOOTS.has(step.id) || MOVES_PROJECT.has(step.id),
  );
  return at >= 0 && BOOTS.has(steps[at].id) ? at : -1;
}
