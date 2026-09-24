"use client";

import { typingMs } from "./natural";
import { collectLeaves } from "./pane-tree";
import { shellDrive, withShellDrive } from "./shell-drive";
import {
  finishOnce,
  inLastPane,
  inProject,
  isDone,
  press,
  tapTail,
  type StepOf,
  type TourContext,
  type TourStepMoves,
} from "./tour-kit";

// The + in the pane's tab strip: a terminal as a tab of its own, which keeps
// the full width of a frame too narrow to split.
const newTerminalButton = (ctx: TourContext) =>
  inLastPane(ctx, '[aria-label="New terminal"]');

function hasShell(ctx: TourContext): boolean {
  const s = ctx.snapshot();
  return collectLeaves(s.trees[s.selected] ?? null).some((leaf) =>
    leaf.tabs.some((tab) => tab.kind === "shell"),
  );
}

// Types a command into the project's shell, opening one in a new tab first
// when the project has none.
export function shellMoves(
  ctx: TourContext,
  step: StepOf<"shell">,
): TourStepMoves {
  const openShell = (how: "click" | "press") => {
    if (hasShell(ctx)) return;
    if (how === "click") newTerminalButton(ctx)?.click();
    else press(newTerminalButton(ctx));
  };
  const finish = finishOnce(ctx, step, (how) => {
    openShell("press");
    const cancel = withShellDrive(ctx.snapshot().selected, (drive) =>
      drive.send(step.command, how === "quiet" ? { instant: true } : undefined),
    );
    if (how === "mime") ctx.onWait(cancel);
  });
  return {
    moves: [
      {
        offsetMs: -1300,
        travelMs: 900,
        target: () => (hasShell(ctx) ? null : newTerminalButton(ctx)),
        act: () => {
          if (!isDone(ctx, step)) openShell("click");
        },
      },
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => shellDrive(ctx.snapshot().selected)?.field() ?? null,
        anchor: "start",
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: () => typingMs(step.command),
  };
}

// Review sits in the pane's More options menu unless the visitor has pinned it
// to the toolbar, where one press opens it — in the pane being worked in.
export function reviewMoves(
  ctx: TourContext,
  step: StepOf<"review">,
): TourStepMoves {
  const pinned = () => inLastPane(ctx, '[aria-label="Review changes"]');
  const more = () => inLastPane(ctx, '[aria-label="More options"]');
  const item = () => inProject(ctx, '[data-tour="pane-action:review"]');
  const finish = finishOnce(ctx, step, (how) => {
    // The menu row adds the tab and closes the menu; the menu's backdrop must
    // not be left up to swallow the visitor's next click.
    const el = item() ?? pinned();
    if (how === "mime" && el) el.click();
    else if (el) press(el);
    else ctx.perform.openReview();
  });
  return {
    moves: [
      {
        offsetMs: -1000,
        travelMs: 900,
        target: () => (pinned() ? null : more()),
        act: () => {
          if (!isDone(ctx, step) && !pinned() && !item()) more()?.click();
        },
      },
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => item() ?? pinned(),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

export function commitMoves(
  ctx: TourContext,
  step: StepOf<"commit">,
): TourStepMoves {
  const button = () => inProject(ctx, '[data-tour="git-commit"]');
  const finish = finishOnce(ctx, step, (how) => {
    if (how === "mime" && button()) button()?.click();
    else ctx.perform.commit();
  });
  return {
    moves: [{ offsetMs: 0, travelMs: 900, target: button, act: finish.fire }],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// The branch pill opens the switcher; the branch's row checks it out and
// closes it.
export function checkoutMoves(
  ctx: TourContext,
  step: StepOf<"checkout">,
): TourStepMoves {
  const pill = () => inProject(ctx, '[data-tour="branch-pill"]');
  const isOpen = () => pill()?.getAttribute("aria-expanded") === "true";
  const row = () => inProject(ctx, `[data-tour="branch:${step.branch}"]`);
  const finish = finishOnce(ctx, step, (how) => {
    const el = row();
    if (how === "mime" && el) return el.click();
    if (el && isOpen()) return press(el);
    ctx.perform.checkout(step.branch);
  });
  return {
    moves: [
      {
        offsetMs: -1000,
        travelMs: 900,
        target: pill,
        act: () => {
          if (!isDone(ctx, step) && !isOpen()) pill()?.click();
        },
      },
      { offsetMs: 0, travelMs: 700, target: row, act: finish.fire },
    ],
    land: (opts) => {
      finish.land(opts);
      if (isOpen()) press(pill());
    },
    latch: finish.latch,
    tailMs: tapTail,
  };
}
