"use client";

import { flushSync } from "react-dom";
import { seededRandom } from "./natural";
import type { NewProjectInput } from "./add-project-modal";
import type { CopyMode, TourAgent, TourStep, TourStepId } from "./tour";
import {
  resolveProject,
  stepDone,
  type StepBinding,
  type TourSnapshot,
} from "./tour-progress";

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

// Lands a step at once. `quiet` is for a step passed through on the way to
// another: it arrives without the ceremony of a dialog left open on screen.
export type TourLand = (opts?: { quiet?: boolean }) => void;

export type TourStepMoves = {
  moves: TourMove[];
  // What the step was heading for, landed at once.
  land: TourLand;
  // Marks the step as pressed without pressing it — for a control the visitor
  // is pressing themselves.
  latch: () => void;
  // How long past the beat the step is still visibly happening.
  tailMs: () => number;
  // Tidies up after a step that has already counted, when a later one is run
  // from the list — a dialog it opened is not left over what comes next.
  settle?: () => void;
};

// The frame's own doing for the steps a mimed click cannot finish: a picker
// that is gone, a menu closed under it, or a step landed with nobody watching.
// Each one has rendered by the time it returns, so the step after it finds the
// controls it made.
export type TourPerformers = {
  addProject: (input: NewProjectInput) => void;
  selectProject: (name: string) => void;
  // Puts a project on screen without counting it as a visit — the tour
  // returning where a step acts, not the visitor going there.
  showProject: (name: string) => void;
  // Counts a visit to a project and puts it on screen, even when it already is
  // — for the steps whose whole point is that visit.
  visitProject: (name: string) => void;
  openAgent: (project: string, agent: TourAgent) => void;
  copy: (project: string, mode: CopyMode) => void;
  openReview: () => void;
  checkout: (branch: string) => void;
  commit: () => void;
  recordAction: (action: string) => void;
};

// What the moves reach into the window through. Every accessor reads at the
// moment of the click: the control a step presses may not exist when the tour
// is armed, and the project it belongs to may have changed by then.
export type TourContext = {
  container: HTMLElement;
  // Where the step acts, as far as the tour knows ahead of time.
  bound: StepBinding;
  // What a step remembers across the mimed tour and a landing from the list,
  // which build its moves afresh.
  memo: Map<string, unknown>;
  snapshot: () => TourSnapshot;
  startButton: () => HTMLElement | null;
  chip: (agent: TourAgent) => HTMLElement | null;
  perform: TourPerformers;
  // A prompt that is still waiting for its session registers its cancel here.
  onWait: (cancel: () => void) => void;
  onStepDone: () => void;
};

export type StepOf<K extends TourStepId> = Extract<TourStep, { id: K }>;

// Room for the tap ring to finish before the cursor fades.
const TAP_TAIL_MS = 600;

export const tapTail = () => TAP_TAIL_MS;

// Brings the step's project on screen, out of any other view, before a landing
// acts on it. A step that opens a project does that itself, and counts the
// visit as it goes.
function goTo(ctx: TourContext, step: TourStep) {
  if (step.id === "openProject" || step.id === "openAgent") return;
  const s = ctx.snapshot();
  const target = resolveProject(s, ctx.bound.at) ?? s.selected;
  if (!target || (target === s.selected && s.view === "project")) return;
  ctx.perform.showProject(target);
}

export function isDone(ctx: TourContext, step: TourStep): boolean {
  return stepDone(step, ctx.snapshot(), ctx.bound);
}

export function inFrame(
  ctx: TourContext,
  selector: string,
): HTMLElement | null {
  return ctx.container.querySelector<HTMLElement>(selector);
}

// Every visited project stays mounted behind the one on screen, so a control
// is looked up inside the visible project's view, never the first match.
export function inProject(
  ctx: TourContext,
  selector: string,
): HTMLElement | null {
  const project = CSS.escape(ctx.snapshot().selected);
  return ctx.container.querySelector<HTMLElement>(
    `[data-demo-project="${project}"] ${selector}`,
  );
}

// The last match inside the visible project: of a control every pane carries,
// the one on the pane opened most recently — the one being worked in.
export function inLastPane(
  ctx: TourContext,
  selector: string,
): HTMLElement | null {
  const project = CSS.escape(ctx.snapshot().selected);
  const all = ctx.container.querySelectorAll<HTMLElement>(
    `[data-demo-project="${project}"] ${selector}`,
  );
  return all[all.length - 1] ?? null;
}

// A landing click, rendered before it returns so the next step lands on what
// this one made.
export function press(el: HTMLElement | null | undefined): void {
  if (el) flushSync(() => el.click());
}

// A header's action strip and a pane's tab strip scroll sideways on a narrow
// stage, so a control has to be brought inside its strip before the cursor
// aims — the strip's own scrollLeft, never scrollIntoView, which walks to the
// document and would yank the marketing page.
export function revealInStrip(
  container: HTMLElement,
  el: HTMLElement | null,
): boolean {
  if (!el) return false;
  let strip = el.parentElement;
  while (strip && strip !== container && strip.scrollWidth <= strip.clientWidth)
    strip = strip.parentElement;
  if (!strip || strip === container) return true;
  const box = strip.getBoundingClientRect();
  const left = el.getBoundingClientRect().left - box.left + strip.scrollLeft;
  const right = left + el.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth)
    strip.scrollLeft = right - strip.clientWidth;
  const now = el.getBoundingClientRect();
  return now.left >= box.left - 1 && now.right <= box.right + 1;
}

// Where on a control the mimed click lands, relative to the frame. Re-read
// every beat: the visitor is usually still scrolling the frame into place, and
// a stale origin would land the cursor on the wrong control. Nobody hits dead
// centre, so the point sits a little off it — the same little off it for the
// tap as for the reach, on every visit — and a text field is clicked where its
// text starts rather than halfway along it.
export function pointOn(
  frame: DOMRect,
  el: HTMLElement,
  move: TourMove,
  seed: string,
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const rng = seededRandom(seed);
  const left = r.left - frame.left;
  const top = r.top - frame.top;
  if (move.anchor === "start")
    return {
      x: left + 18 + rng() * 12,
      y: top + r.height / 2 + (rng() - 0.5) * r.height * 0.3,
    };
  const play = Math.min(r.width, r.height) * 0.3;
  return {
    x: left + r.width / 2 + (rng() - 0.5) * play,
    y: top + r.height / 2 + (rng() - 0.5) * play,
  };
}

// How a step's last move arrives: the mimed cursor clicking the real control,
// a landing the visitor asked for and is watching, or a quiet one on the way
// to another step.
export type Arrival = "mime" | "land" | "quiet";

// A step whose every move and landing ends in the same place: `finish` runs at
// most once, and not at all if the window already shows what it would do.
export function finishOnce(
  ctx: TourContext,
  step: TourStep,
  finish: (how: Arrival) => void,
) {
  let fired = false;
  const run = (how: Arrival) => {
    if (fired) return;
    fired = true;
    if (!isDone(ctx, step)) {
      // A landing happens where the step's progress is read: the visitor may
      // be looking at another project than the one the tour left on screen.
      if (how !== "mime") goTo(ctx, step);
      finish(how);
    }
    ctx.onStepDone();
  };
  const land: TourLand = (opts) => run(opts?.quiet ? "quiet" : "land");
  return {
    fire: () => run("mime"),
    land,
    latch: () => {
      fired = true;
    },
  };
}
