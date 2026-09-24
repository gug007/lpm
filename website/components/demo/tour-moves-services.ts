"use client";

import { resolveProject } from "./tour-progress";
import {
  finishOnce,
  inProject,
  isDone,
  press,
  revealInStrip,
  tapTail,
  type StepOf,
  type TourContext,
  type TourStepMoves,
} from "./tour-kit";

// Room past an action's own run for its result to be read before Close.
const ACTION_READ_MS = 1700;
const DEFAULT_ACTION_MS = 1500;
const CLOSE_RETRY_MS = 100;
const CLOSE_TRIES = 40;

export function startMoves(
  ctx: TourContext,
  step: StepOf<"start">,
): TourStepMoves {
  // Once the visitor's own click has booted the project this same button reads
  // Stop, and pressing it would shut it all down — the step is already done.
  const finish = finishOnce(ctx, step, (how) => {
    if (how === "mime") ctx.startButton()?.click();
    else press(ctx.startButton());
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 1020,
        target: ctx.startButton,
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// The chevron beside Start opens the project's Services and profiles menu.
function startMenu(ctx: TourContext) {
  const chevron = () => inProject(ctx, '[aria-label="Services and profiles"]');
  const isOpen = () => chevron()?.getAttribute("aria-expanded") === "true";
  return {
    chevron,
    isOpen,
    open: () => {
      if (!isOpen()) press(chevron());
    },
    close: () => {
      if (isOpen()) press(chevron());
    },
  };
}

export function startProfileMoves(
  ctx: TourContext,
  step: StepOf<"startProfile">,
): TourStepMoves {
  const menu = startMenu(ctx);
  const item = () => inProject(ctx, `[data-tour="profile:${step.profile}"]`);
  // Picking a profile closes the menu behind it.
  const finish = finishOnce(ctx, step, (how) => {
    const el = item();
    if (how === "mime" && el) return el.click();
    menu.open();
    press(item());
  });
  return {
    moves: [
      {
        offsetMs: -1000,
        travelMs: 900,
        target: menu.chevron,
        act: () => {
          if (!isDone(ctx, step) && !menu.isOpen()) menu.chevron()?.click();
        },
      },
      { offsetMs: 0, travelMs: 700, target: item, act: finish.fire },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// Switching one service on or off, or off and on again, from the Services half
// of the same menu. A service row leaves the menu open, so the step closes it
// the way a visitor would, with the chevron.
export function serviceMenuMoves(
  ctx: TourContext,
  step: StepOf<"toggleService" | "restartService">,
): TourStepMoves {
  const menu = startMenu(ctx);
  const item = () => inProject(ctx, `[data-tour="service:${step.service}"]`);
  const isRunning = () => {
    const s = ctx.snapshot();
    return s.running[s.selected]?.has(step.service) ?? false;
  };
  const wanted = step.id === "toggleService" ? step.on : true;
  const toggle = (how: "click" | "press") => () => {
    if (isDone(ctx, step)) return;
    const el = item();
    if (how === "click") el?.click();
    else press(el);
  };
  const finish = finishOnce(ctx, step, () => {
    menu.open();
    if (step.id === "restartService" && isRunning()) toggle("press")();
    if (isRunning() !== wanted) toggle("press")();
  });
  const closeAfter = (fn: () => void) => () => {
    fn();
    menu.close();
  };
  const toggles =
    step.id === "restartService"
      ? [
          {
            offsetMs: -1800,
            act: () => {
              if (isRunning()) toggle("click")();
            },
          },
          {
            offsetMs: -900,
            act: () => {
              if (!isRunning()) toggle("click")();
            },
          },
        ]
      : [
          {
            offsetMs: -900,
            act: () => {
              if (isRunning() !== wanted) toggle("click")();
            },
          },
        ];
  return {
    moves: [
      {
        offsetMs: toggles[0].offsetMs - 900,
        travelMs: 900,
        target: menu.chevron,
        act: () => {
          if (!isDone(ctx, step) && !menu.isOpen()) menu.chevron()?.click();
        },
      },
      ...toggles.map((t) => ({ ...t, travelMs: 650, target: item })),
      {
        offsetMs: 0,
        travelMs: 650,
        target: menu.chevron,
        act: closeAfter(finish.fire),
      },
    ],
    land: (opts) => closeAfter(() => finish.land(opts))(),
    latch: finish.latch,
    tailMs: tapTail,
  };
}

export function serviceTabMoves(
  ctx: TourContext,
  step: StepOf<"serviceTab">,
): TourStepMoves {
  const tab = () => inProject(ctx, `[data-tab="s:${step.service}"]`);
  const finish = finishOnce(ctx, step, (how) => {
    if (how === "mime") tab()?.click();
    else press(tab());
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 900,
        target: tab,
        reveal: () => revealInStrip(ctx.container, tab()),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// The port on a service's tab opens the running app in a browser tab.
export function previewMoves(
  ctx: TourContext,
  step: StepOf<"preview">,
): TourStepMoves {
  const port = () =>
    inProject(
      ctx,
      `[aria-label="Preview localhost:${step.port} in a browser tab"]`,
    );
  const finish = finishOnce(ctx, step, (how) => {
    if (how === "mime") port()?.click();
    else press(port());
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 900,
        target: port,
        reveal: () => revealInStrip(ctx.container, port()),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// An action button runs its command in a dialog — after a Run, for one that
// asks first — and the step reads the result, then closes it. Passed through
// quietly, it counts as run without leaving a dialog up over whatever comes
// next.
export function runActionMoves(
  ctx: TourContext,
  step: StepOf<"runAction">,
): TourStepMoves {
  // Read off the project the step acts on, whichever is on screen now.
  const actionIn = (s = ctx.snapshot()) =>
    s.projects
      .find((p) => p.name === (resolveProject(s, ctx.bound.at) ?? s.selected))
      ?.actions.find((a) => a.name === step.action);
  const planned = actionIn();
  const readMs = (planned?.durationMs ?? DEFAULT_ACTION_MS) + ACTION_READ_MS;
  const button = () => inProject(ctx, `[data-tour="action:${step.action}"]`);
  // The project whose dialog the tour opened, so only that dialog is ever
  // pressed on the tour's behalf — never one the visitor opened elsewhere.
  const dialogAt = () => (ctx.memo.get("dialogAt") as string | undefined) ?? null;
  const inDialog = (selector: string) => {
    const at = dialogAt();
    return at === null
      ? null
      : ctx.container.querySelector<HTMLButtonElement>(
          `[data-demo-project="${CSS.escape(at)}"] ${selector}`,
        );
  };
  const runButton = () => inDialog('[data-tour="action-run"]');
  const close = () => inDialog('[data-tour="action-close"]');
  const open = (how: "click" | "press") => {
    const el = button();
    if (!el) return;
    ctx.memo.set("dialogAt", ctx.snapshot().selected);
    if (how === "click") el.click();
    else press(el);
  };
  const closeIfDone = () => {
    const el = close();
    if (!el || el.disabled) return;
    ctx.memo.delete("dialogAt");
    el.click();
  };
  // A dialog the tour opened and is leaving behind: still asking gets its
  // Run, still running gets its Close as soon as it can take one.
  const settleDialog = () => {
    if (runButton()) press(runButton());
    let left = CLOSE_TRIES;
    const attempt = () => {
      const el = close();
      if (!el) return;
      if (!el.disabled) {
        ctx.memo.delete("dialogAt");
        return press(el);
      }
      left -= 1;
      if (left > 0) window.setTimeout(attempt, CLOSE_RETRY_MS);
    };
    attempt();
  };
  const finish = finishOnce(ctx, step, (how) => {
    // A control the header had no room for cannot be shown running.
    if (how === "quiet" || (!button() && !runButton()))
      return ctx.perform.recordAction(step.action);
    const confirm = actionIn()?.confirm ?? false;
    if (how === "mime") {
      if (!confirm) return open("click");
      const run = runButton();
      if (run) return run.click();
    }
    if (!runButton() && !close()) open("press");
    if (confirm) press(runButton());
  });
  const moves: TourStepMoves["moves"] = planned?.confirm
    ? [
        {
          offsetMs: -readMs - 1000,
          travelMs: 900,
          target: button,
          reveal: () => revealInStrip(ctx.container, button()),
          act: () => {
            if (!isDone(ctx, step) && !runButton() && !close()) open("click");
          },
        },
        { offsetMs: -readMs, travelMs: 700, target: runButton, act: finish.fire },
      ]
    : [
        {
          offsetMs: -readMs,
          travelMs: 900,
          target: button,
          reveal: () => revealInStrip(ctx.container, button()),
          act: finish.fire,
        },
      ];
  return {
    moves: [
      ...moves,
      { offsetMs: 0, travelMs: 700, target: close, act: closeIfDone },
    ],
    land: (opts) => {
      if (opts?.quiet) settleDialog();
      finish.land(opts);
    },
    latch: finish.latch,
    tailMs: tapTail,
    settle: settleDialog,
  };
}
