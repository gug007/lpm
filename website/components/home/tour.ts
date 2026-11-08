import type { TourAction } from "./demo-protocol";

export type TourStepId = TourAction["id"];

// Steps that need nothing but their id, so a tour can name them bare.
type BareStepId = Extract<
  TourStepId,
  | "addProject"
  | "start"
  | "agent"
  | "prompt"
  | "codex"
  | "codexPrompt"
  | "review"
  | "commit"
>;

// What the pill in the frame's corner says: one line for a narrow stage, one
// for the rest.
export type TourHint = { short: string; long: string };

type TourStepCopy = {
  title: string;
  body: string;
  // How long after the previous step lands this one does, on a clock that
  // starts as the frame parks in the viewport.
  leadMs: number;
  // Replaces the pill's line once this step has happened.
  hint?: TourHint;
};

export type TourStep = TourAction &
  TourStepCopy & {
    // When the opening tour lands this step.
    beatMs: number;
  };

// A control the visitor is asked to click first, named by its label on screen,
// and the line that asks. A tour with one waits for the visitor instead of
// playing itself.
export type TourInvite = { button: string; hint: string };

export type Tour = {
  steps: TourStep[];
  // The pill's opening line, up while the tour gets going.
  hint: TourHint;
  invite?: TourInvite;
  // How many steps the frame lands, unmimed, before it is shown, so the window
  // opens on a project already at work rather than an empty pane.
  opening?: number;
  // Seeded projects this frame leaves out, so a tour can add one of those
  // folders as a new project.
  omitProjects?: string[];
  // The line that replaces the steps once all of them have happened.
  done: string;
};

const DONE_LINE = "That's the whole tour. Try it on your own projects next.";

const OPENING_HINT: TourHint = {
  short: "Booting saas-app…",
  long: "Booting saas-app — every pane is live. Click anything.",
};

// The default copy and pacing for each kind of step. The generic kinds read
// fine as they are; the ones that take a target are written for the page that
// uses them, so their defaults are only a fallback.
export const TOUR_STEP_CATALOG: Record<TourStepId, TourStepCopy> = {
  addProject: {
    title: "Add a project",
    body: "Point lpm at a folder. It finds your services and lands in the sidebar, with Claude Code and Codex one click away.",
    leadMs: 4400,
  },
  addSshHost: {
    title: "Add an SSH host",
    body: "Pick a host from your SSH config. The remote project lands in the same sidebar as your local ones.",
    leadMs: 6500,
  },
  start: {
    title: "Start the project",
    body: "One click boots the project's services. Each one streams its live output in a tab of its own.",
    leadMs: 1700,
  },
  agent: {
    title: "Open Claude Code",
    body: "The agent opens in a terminal that already knows the project. No cd, no setup.",
    leadMs: 4100,
  },
  prompt: {
    title: "Enter and send a prompt",
    body: "Ask for the change in the composer. The turn streams back in the tab: files read, edits made, tests run.",
    leadMs: 1600,
  },
  codex: {
    title: "Open Codex alongside it",
    body: "A second agent lands in a tab next to the first. Same project, same working tree.",
    leadMs: 6600,
    hint: {
      short: "Two agents at once — switch tabs",
      long: "Two agents on one project — switch tabs. ml-pipeline is asking you something.",
    },
  },
  codexPrompt: {
    title: "Enter and send a prompt",
    body: "Codex takes a task of its own and starts on it. Two agents working the project at once.",
    leadMs: 1800,
  },
  openProject: {
    title: "Switch projects",
    body: "Click another project in the sidebar. Whatever the last one was running keeps running.",
    leadMs: 3200,
  },
  openAgent: {
    title: "Jump to an agent",
    body: "Every agent has a row in the sidebar. Clicking one opens its tab.",
    leadMs: 4600,
  },
  answer: {
    title: "Answer it",
    body: "Type the answer in the composer and the agent picks the task back up.",
    leadMs: 2600,
  },
  startProfile: {
    title: "Start a profile",
    body: "The Start menu lists the project's profiles. Picking one runs exactly the services it names.",
    leadMs: 2800,
  },
  toggleService: {
    title: "Toggle one service",
    body: "The Services menu switches a single service on or off. The others keep running.",
    leadMs: 3600,
  },
  restartService: {
    title: "Restart one service",
    body: "Switch a service off and on again in the Services menu. The others never stop.",
    leadMs: 4600,
  },
  serviceTab: {
    title: "Read one service",
    body: "Every service has a tab of its own, with nothing else mixed into its output.",
    leadMs: 3000,
  },
  preview: {
    title: "Preview the dev server",
    body: "A browser tab beside the logs shows the running app.",
    leadMs: 3200,
  },
  shell: {
    title: "Run a command",
    body: "The + beside the tabs opens a shell in the project folder, next to the running services.",
    leadMs: 3600,
  },
  review: {
    title: "Review the changes",
    body: "The working tree opens as a diff in a tab of its own.",
    leadMs: 3400,
  },
  commit: {
    title: "Commit",
    body: "The Git bar commits the working tree without leaving the window.",
    leadMs: 4400,
  },
  checkout: {
    title: "Switch branches",
    body: "The branch switcher checks out another branch without stopping anything.",
    leadMs: 3400,
  },
  runAction: {
    title: "Run an action",
    body: "A saved command runs from its button and reports back.",
    leadMs: 5200,
  },
  copy: {
    title: "Duplicate the project",
    body: "A copy lands under the original, with an agent already working in it.",
    leadMs: 3400,
  },
};

export type TourStepInput =
  | BareStepId
  | (TourAction & Partial<TourStepCopy>);

// Builds a tour from its steps, in the order the page wants them shown and
// played. A step may override the catalog's copy or timing for that page.
export function defineTour(
  steps: TourStepInput[],
  opts: {
    hint?: TourHint;
    invite?: TourInvite;
    opening?: number;
    omitProjects?: string[];
    done?: string;
  } = {},
): Tour {
  let clock = 0;
  return {
    hint: opts.hint ?? OPENING_HINT,
    done: opts.done ?? DONE_LINE,
    ...(opts.invite ? { invite: opts.invite } : {}),
    ...(opts.opening ? { opening: opts.opening } : {}),
    ...(opts.omitProjects ? { omitProjects: opts.omitProjects } : {}),
    steps: steps.map((input) => {
      const step: TourAction & Partial<TourStepCopy> =
        typeof input === "string" ? { id: input } : input;
      const spec = { ...TOUR_STEP_CATALOG[step.id], ...step };
      clock += spec.leadMs;
      return { ...spec, beatMs: clock };
    }),
  };
}

// The home page's tour: boot a project, then put both agents to work on it.
// The window opens with saas-app already up and Claude Code on a task, so the
// first thing a visitor sees is the product at work; the next click, Codex, is
// theirs, so they try instead of watch.
export const HOME_TOUR = defineTour(
  ["start", "agent", "prompt", "codex", "codexPrompt"],
  {
    done: "You ran the whole loop: services up, two agents on one project.",
    opening: 3,
    invite: {
      button: "Codex",
      hint: "Claude Code is on a task. Click Codex to put a second agent on it.",
    },
  },
);

// How many steps have happened in the window, whoever did them, and whether
// the mimed tour is still doing them.
export type TourState = { stage: number; playing: boolean };

// Runs the demo up to and including a step — by its place in the tour, since a
// tour can take the same kind of step twice — the way a visitor clicking
// through the window would.
export type TourHandle = { run: (index: number) => void };
