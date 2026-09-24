"use client";

import type { TourStep } from "./tour";
import type { TourContext, TourStepMoves } from "./tour-kit";
import {
  addProjectMoves,
  addSshHostMoves,
  answerMoves,
  chipMoves,
  copyMoves,
  openAgentMoves,
  openProjectMoves,
  promptMoves,
} from "./tour-moves-agents";
import {
  previewMoves,
  runActionMoves,
  serviceMenuMoves,
  serviceTabMoves,
  startMoves,
  startProfileMoves,
} from "./tour-moves-services";
import {
  checkoutMoves,
  commitMoves,
  reviewMoves,
  shellMoves,
} from "./tour-moves-panes";

export type {
  TourContext,
  TourMove,
  TourPerformers,
  TourStepMoves,
} from "./tour-kit";

export function tourStepMoves(
  step: TourStep,
  ctx: TourContext,
): TourStepMoves {
  switch (step.id) {
    case "addProject":
      return addProjectMoves(ctx, step);
    case "addSshHost":
      return addSshHostMoves(ctx, step);
    case "start":
      return startMoves(ctx, step);
    case "agent":
      return chipMoves(ctx, step, "claude", 1000);
    case "codex":
      return chipMoves(ctx, step, "codex", 800);
    case "prompt":
      return promptMoves(ctx, step, "claude");
    case "codexPrompt":
      return promptMoves(ctx, step, "codex");
    case "openProject":
      return openProjectMoves(ctx, step);
    case "openAgent":
      return openAgentMoves(ctx, step);
    case "answer":
      return answerMoves(ctx, step);
    case "copy":
      return copyMoves(ctx, step);
    case "startProfile":
      return startProfileMoves(ctx, step);
    case "toggleService":
    case "restartService":
      return serviceMenuMoves(ctx, step);
    case "serviceTab":
      return serviceTabMoves(ctx, step);
    case "preview":
      return previewMoves(ctx, step);
    case "runAction":
      return runActionMoves(ctx, step);
    case "shell":
      return shellMoves(ctx, step);
    case "review":
      return reviewMoves(ctx, step);
    case "commit":
      return commitMoves(ctx, step);
    case "checkout":
      return checkoutMoves(ctx, step);
  }
}
