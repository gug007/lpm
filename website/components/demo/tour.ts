export type TourStepId = "start" | "agent" | "prompt" | "codex" | "codexPrompt";

export type TourStep = {
  id: TourStepId;
  title: string;
  body: string;
  // When the opening tour presses this step's control, on a clock that starts
  // as the frame parks in the viewport.
  beatMs: number;
};

export const TOUR_BEAT_MS = {
  start: 1700,
  agent: 5800,
  prompt: 7400,
  codex: 14000,
  codexPrompt: 15800,
} as const;

// What the tour types when a project's agent action carries no prompt of its
// own — every canned session knows how to answer it.
export const TOUR_FALLBACK_PROMPT = "Run the tests";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "start",
    title: "Start the project",
    body: "One click boots every service. Each one streams its live output in a tab of its own.",
    beatMs: TOUR_BEAT_MS.start,
  },
  {
    id: "agent",
    title: "Open Claude Code",
    body: "The agent opens in a terminal that already knows the project. No cd, no setup.",
    beatMs: TOUR_BEAT_MS.agent,
  },
  {
    id: "prompt",
    title: "Enter and send a prompt",
    body: "Ask for the change in the composer. The turn streams back in the tab: files read, edits made, tests run.",
    beatMs: TOUR_BEAT_MS.prompt,
  },
  {
    id: "codex",
    title: "Open Codex alongside it",
    body: "A second agent lands in a tab next to the first. Same project, same working tree.",
    beatMs: TOUR_BEAT_MS.codex,
  },
  {
    id: "codexPrompt",
    title: "Enter and send a prompt",
    body: "Codex takes a task of its own and starts on it. Two agents working the project at once.",
    beatMs: TOUR_BEAT_MS.codexPrompt,
  },
];

// How many steps have happened in the window, whoever did them, and whether
// the mimed tour is still doing them.
export type TourState = { stage: number; playing: boolean };

// Runs the demo up to and including a step, the way a visitor clicking through
// the window would.
export type TourHandle = { run: (id: TourStepId) => void };
