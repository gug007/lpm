"use client";

import { agentDrive, agentDriveKey, withAgentDrive } from "./agent-drive";
import { typingMs } from "./natural";
import { TOUR_NEW_PROJECT_FOLDER, type TourStepId } from "./tour";

type Agent = "claude" | "codex";

// One click of the mimed tour: where the cursor goes and what pressing there
// does. A step is usually one move; adding a project is four.
export type TourMove = {
  // From the step's beat, at or before it: the last move lands on the beat.
  offsetMs: number;
  // How long before the click the cursor sets off for the target.
  travelMs: number;
  target: () => HTMLElement | null;
  // Where on the target the click lands: its middle, or the start of a field.
  anchor?: "center" | "start";
  // Brings the target into view first; false when it cannot be, so the click
  // goes without the mime rather than tapping whatever sits under that point.
  reveal?: () => boolean;
  act: () => void;
};

export type TourStepMoves = {
  moves: TourMove[];
  // What the step was heading for, landed at once.
  land: () => void;
  // Marks the step as pressed without pressing it — for a control the visitor
  // is pressing themselves.
  latch: () => void;
  // How long past the beat the step is still visibly happening.
  tailMs: () => number;
};

// What the moves reach into the window through. Every accessor reads at the
// moment of the click: the control a step presses may not exist when the tour
// is armed, and the project it belongs to may have changed by then.
export type TourContext = {
  container: HTMLElement;
  startButton: () => HTMLElement | null;
  chip: (agent: Agent) => HTMLElement | null;
  servicesRunning: () => boolean;
  prompts: () => { project: string; claude: string; codex: string };
  // Adopts the folder without the picker, synchronously enough for the next
  // step to find the new project's controls.
  addProject: (folder: string) => void;
  // A prompt that is still waiting for its session registers its cancel here.
  onWait: (cancel: () => void) => void;
  onStepDone: (id: TourStepId) => void;
};

// Room for the tap ring to finish before the cursor fades.
const TAP_TAIL_MS = 600;

// The action strip scrolls sideways on a narrow stage, so a chip has to be
// brought inside it before the cursor aims — the strip's own scrollLeft, never
// scrollIntoView, which walks to the document and would yank the marketing
// page.
function revealChip(container: HTMLElement, btn: HTMLElement | null): boolean {
  if (!btn) return false;
  let strip = btn.parentElement;
  while (strip && strip !== container && strip.scrollWidth <= strip.clientWidth)
    strip = strip.parentElement;
  if (!strip || strip === container) return true;
  const box = strip.getBoundingClientRect();
  const left = btn.getBoundingClientRect().left - box.left + strip.scrollLeft;
  const right = left + btn.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth)
    strip.scrollLeft = right - strip.clientWidth;
  const chip = btn.getBoundingClientRect();
  return chip.left >= box.left - 1 && chip.right <= box.right + 1;
}

// Each control is pressed at most once: Start is a toggle, and a second click
// on an agent chip would open a duplicate tab.
function once(fn: () => void): { fire: () => void; latch: () => void } {
  let fired = false;
  return {
    fire: () => {
      if (fired) return;
      fired = true;
      fn();
    },
    latch: () => {
      fired = true;
    },
  };
}

function startMoves(ctx: TourContext): TourStepMoves {
  const press = once(() => {
    // Once the visitor's own click has booted the project this same button
    // reads Stop, and pressing it would shut it all down.
    if (!ctx.servicesRunning()) ctx.startButton()?.click();
    ctx.onStepDone("start");
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 1020,
        target: ctx.startButton,
        act: press.fire,
      },
    ],
    land: press.fire,
    latch: press.latch,
    tailMs: () => TAP_TAIL_MS,
  };
}

function chipMoves(
  ctx: TourContext,
  id: TourStepId,
  agent: Agent,
  travelMs: number,
): TourStepMoves {
  const press = once(() => {
    ctx.chip(agent)?.click();
    ctx.onStepDone(id);
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs,
        target: () => ctx.chip(agent),
        reveal: () => revealChip(ctx.container, ctx.chip(agent)),
        act: press.fire,
      },
    ],
    land: press.fire,
    latch: press.latch,
    tailMs: () => TAP_TAIL_MS,
  };
}

// The session registers itself a render after the chip that opened it was
// clicked, so the prompt waits for the field rather than for the next render.
function promptMoves(
  ctx: TourContext,
  id: TourStepId,
  agent: Agent,
): TourStepMoves {
  let fired = false;
  const send = (instant: boolean) => {
    if (fired) return;
    fired = true;
    const { project, [agent]: text } = ctx.prompts();
    const cancel = withAgentDrive(agentDriveKey(project, agent), (drive) => {
      if (drive.idle()) drive.send(text, instant ? { instant: true } : undefined);
    });
    // A landing prompt has to outlive the teardown that asked for it; a mimed
    // one is cancelled with the rest of the sequence.
    if (!instant) ctx.onWait(cancel);
    ctx.onStepDone(id);
  };
  const field = () =>
    agentDrive(agentDriveKey(ctx.prompts().project, agent))?.field() ?? null;
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 700,
        target: field,
        anchor: "start",
        act: () => send(false),
      },
    ],
    land: () => send(true),
    latch: () => {
      fired = true;
    },
    tailMs: () => typingMs(ctx.prompts()[agent]),
  };
}

// Through the picker the way a visitor goes: the sidebar's +, Local Folder,
// the folder, Open. Landing skips the picker and adopts the folder outright.
function addProjectMoves(ctx: TourContext): TourStepMoves {
  const folder = TOUR_NEW_PROJECT_FOLDER;
  const find = (name: string) =>
    ctx.container.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  const click = (name: string) => () => find(name)?.click();
  const finish = once(() => {
    const open = find("picker-open");
    const row = find(`folder:${folder}`);
    // Open adopts whatever the picker has selected, so it is only pressed once
    // the folder row before it has visibly landed.
    if (open && row?.dataset.selected === "true") open.click();
    else ctx.addProject(folder);
    ctx.onStepDone("addProject");
  });
  return {
    moves: [
      {
        offsetMs: -2700,
        travelMs: 1000,
        target: () => find("add-project"),
        act: click("add-project"),
      },
      {
        offsetMs: -1800,
        travelMs: 700,
        target: () => find("source-local"),
        act: click("source-local"),
      },
      {
        offsetMs: -900,
        travelMs: 700,
        target: () => find(`folder:${folder}`),
        act: click(`folder:${folder}`),
      },
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => find("picker-open"),
        act: finish.fire,
      },
    ],
    land: finish.fire,
    latch: finish.latch,
    tailMs: () => TAP_TAIL_MS,
  };
}

export function tourStepMoves(id: TourStepId, ctx: TourContext): TourStepMoves {
  switch (id) {
    case "addProject":
      return addProjectMoves(ctx);
    case "start":
      return startMoves(ctx);
    case "agent":
      return chipMoves(ctx, id, "claude", 1000);
    case "codex":
      return chipMoves(ctx, id, "codex", 800);
    case "prompt":
      return promptMoves(ctx, id, "claude");
    case "codexPrompt":
      return promptMoves(ctx, id, "codex");
  }
}
