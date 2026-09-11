export type TourStepId = "start" | "agent" | "codex";

export type TourStep = {
  id: TourStepId;
  title: string;
  body: string;
  // When the opening tour presses this step's control, on a clock that starts
  // as the frame parks in the viewport.
  beatMs: number;
};

export const TOUR_BEAT_MS = { start: 1700, agent: 6200, codex: 10200 } as const;

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
    id: "codex",
    title: "Add Codex beside it",
    body: "A second agent lands in a tab next to the first. Two agents, one project.",
    beatMs: TOUR_BEAT_MS.codex,
  },
];

// How many steps have happened in the window, whoever did them, and whether
// the mimed tour is still doing them.
export type TourState = { stage: number; playing: boolean };

// Runs the demo up to and including a step, the way a visitor clicking through
// the window would.
export type TourHandle = { run: (id: TourStepId) => void };
