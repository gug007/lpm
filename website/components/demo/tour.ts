export type TourStepId =
  | "addProject"
  | "start"
  | "agent"
  | "prompt"
  | "codex"
  | "codexPrompt";

// What the pill in the frame's corner says: one line for a narrow stage, one
// for the rest.
export type TourHint = { short: string; long: string };

type TourStepSpec = {
  title: string;
  body: string;
  // How long after the previous step lands this one does, on a clock that
  // starts as the frame parks in the viewport.
  leadMs: number;
  // Replaces the pill's line once this step has happened.
  hint?: TourHint;
};

export type TourStep = TourStepSpec & {
  id: TourStepId;
  // When the opening tour lands this step.
  beatMs: number;
};

export type Tour = {
  steps: TourStep[];
  // The pill's opening line, up while the tour gets going.
  hint: TourHint;
};

// What the tour types when a project's agent action carries no prompt of its
// own — every canned session knows how to answer it.
export const TOUR_FALLBACK_PROMPT = "Run the tests";

// The folder the tour adopts from the picker — one the demo's sidebar does not
// already list.
export const TOUR_NEW_PROJECT_FOLDER = "client-portal";

const OPENING_HINT: TourHint = {
  short: "Booting saas-app…",
  long: "Booting saas-app — every pane is live. Click anything.",
};

export const TOUR_STEP_CATALOG: Record<TourStepId, TourStepSpec> = {
  addProject: {
    title: "Add a project",
    body: "Point lpm at a folder. It lands in the sidebar with a service to fill in and both agents ready to open.",
    leadMs: 4400,
  },
  start: {
    title: "Start the project",
    body: "One click boots every service. Each one streams its live output in a tab of its own.",
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
};

export type TourStepInput =
  | TourStepId
  | ({ id: TourStepId } & Partial<TourStepSpec>);

// Builds a tour from step ids, in the order the page wants them shown and
// played. A step may override the catalog's copy or timing for that page.
export function defineTour(
  steps: TourStepInput[],
  opts: { hint?: TourHint } = {},
): Tour {
  let clock = 0;
  return {
    hint: opts.hint ?? OPENING_HINT,
    steps: steps.map((input) => {
      const { id, ...overrides } =
        typeof input === "string" ? { id: input } : input;
      const spec = { ...TOUR_STEP_CATALOG[id], ...overrides };
      clock += spec.leadMs;
      return { ...spec, id, beatMs: clock };
    }),
  };
}

// The home page's tour: boot a project, then put both agents to work on it.
export const HOME_TOUR = defineTour([
  "start",
  "agent",
  "prompt",
  "codex",
  "codexPrompt",
]);

// Adopt a folder, then hand it straight to Claude Code.
export const ADD_PROJECT_TOUR = defineTour(["addProject", "agent", "prompt"], {
  hint: {
    short: "Adding a project…",
    long: "Adding a project — every pane is live. Click anything.",
  },
});

// Boot a project and run Claude Code in it.
export const AGENT_TOUR = defineTour(["start", "agent", "prompt"]);

// Nothing plays: the frame opens on an empty workspace and waits for the
// visitor to add the first project.
export const EMPTY_TOUR = defineTour([], {
  hint: {
    short: "No projects yet — add one",
    long: "An empty lpm, same as a fresh install. Add a project to begin.",
  },
});

// How many steps have happened in the window, whoever did them, and whether
// the mimed tour is still doing them.
export type TourState = { stage: number; playing: boolean };

// Runs the demo up to and including a step, the way a visitor clicking through
// the window would.
export type TourHandle = { run: (id: TourStepId) => void };
