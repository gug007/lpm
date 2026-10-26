// The messages between a website page and the demo app in its iframe. The
// website owns each tour's steps and copy; the app plays them against its own
// UI. Mirrors desktop/frontend/src/demo/tour/protocol.ts.

export const SOURCE = "lpm-demo";

export type TourAgent = "claude" | "codex";
export type CopyMode = "duplicate" | "worktree";

export type TourAction =
  | { id: "addProject"; folder?: string }
  | { id: "addSshHost"; host: string }
  | { id: "start" }
  | { id: "agent" }
  | { id: "prompt" }
  | { id: "codex" }
  | { id: "codexPrompt" }
  | { id: "openProject"; project: string }
  | { id: "openAgent"; project: string; agent: TourAgent }
  | { id: "answer"; project: string; agent: TourAgent; text: string }
  | { id: "startProfile"; profile: string }
  | { id: "toggleService"; service: string; on: boolean }
  | { id: "restartService"; service: string }
  | { id: "serviceTab"; service: string }
  | { id: "preview"; port: number }
  | { id: "shell"; command: string }
  | { id: "review" }
  | { id: "commit" }
  | { id: "checkout"; branch: string }
  | { id: "runAction"; action: string }
  | { id: "copy"; project: string; mode: CopyMode };

// A step as it crosses the frame: the action, and when the opening tour plays
// it (ms from the moment the frame parks in view).
export type TourStepWire = TourAction & { beatMs: number };

export type HostMessage =
  | { source: typeof SOURCE; type: "tour"; steps: TourStepWire[] }
  // The frame is parked in view: mime the tour on its beats.
  | { source: typeof SOURCE; type: "play" }
  // A step pill was clicked: carry out every step up to and including it.
  | { source: typeof SOURCE; type: "run"; index: number }
  // The frame left the screen mid-tour: land the remaining steps quietly.
  | { source: typeof SOURCE; type: "settle" }
  // A config preview's project is now this file, as if it had just been saved.
  | { source: typeof SOURCE; type: "config"; yaml: string };

export type AppMessage =
  // The app has booted and takes a tour.
  | { source: typeof SOURCE; type: "ready" }
  // How many steps have happened, whoever did them, and whether the mimed
  // tour is still doing them.
  | { source: typeof SOURCE; type: "state"; stage: number; playing: boolean };

// The iframe's URL picks its data: `?seed=sample` for the sample workspace
// (`&omit=a,b` leaves projects out so a tour can add them), `?config=preview`
// for one project the page's config editor drives, anything else for an empty
// workspace.
