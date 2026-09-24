"use client";

import { agentDrive, agentDriveKey, withAgentDrive } from "./agent-drive";
import { typingMs } from "./natural";
import { CLAUDE_ACTION, CODEX_ACTION } from "./projects";
import {
  TOUR_FALLBACK_PROMPT,
  TOUR_NEW_PROJECT_FOLDER,
  type TourAgent,
} from "./tour";
import {
  finishOnce,
  inFrame,
  isDone,
  press,
  revealInStrip,
  tapTail,
  type StepOf,
  type TourContext,
  type TourMove,
  type TourStepMoves,
} from "./tour-kit";
import { hasAgentTab, type TourSnapshot } from "./tour-progress";

function tourTarget(ctx: TourContext, name: string): HTMLElement | null {
  return inFrame(ctx, `[data-tour="${CSS.escape(name)}"]`);
}

// Clicks a picker's control on the way to its last move, unless the step has
// already happened some other way.
function clickTarget(ctx: TourContext, step: StepOf<"addProject" | "addSshHost">, name: string) {
  return () => {
    if (!isDone(ctx, step)) tourTarget(ctx, name)?.click();
  };
}

function pickerMove(
  ctx: TourContext,
  step: StepOf<"addProject" | "addSshHost">,
  name: string,
  offsetMs: number,
  // The first reach of a step crosses the frame; the rest stay in the picker.
  travelMs = 700,
): TourMove {
  return {
    offsetMs,
    travelMs,
    target: () => tourTarget(ctx, name),
    act: clickTarget(ctx, step, name),
  };
}

// Through the picker the way a visitor goes: the sidebar's +, Local Folder,
// the folder, Open. Landing skips the picker and adopts the folder outright.
export function addProjectMoves(
  ctx: TourContext,
  step: StepOf<"addProject">,
): TourStepMoves {
  const folder = step.folder ?? TOUR_NEW_PROJECT_FOLDER;
  const finish = finishOnce(ctx, step, () => {
    const open = tourTarget(ctx, "picker-open");
    const row = tourTarget(ctx, `folder:${folder}`);
    // Open adopts whatever the picker has selected, so it is only pressed once
    // the folder row before it has visibly landed.
    if (open && row?.dataset.selected === "true") press(open);
    else ctx.perform.addProject({ kind: "local", name: folder });
  });
  return {
    moves: [
      pickerMove(ctx, step, "add-project", -2700, 1000),
      pickerMove(ctx, step, "source-local", -1800),
      pickerMove(ctx, step, `folder:${folder}`, -900),
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => tourTarget(ctx, "picker-open"),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// The sidebar's +, SSH Host, the host list read from ~/.ssh/config, the host,
// Add project.
export function addSshHostMoves(
  ctx: TourContext,
  step: StepOf<"addSshHost">,
): TourStepMoves {
  const finish = finishOnce(ctx, step, () => {
    const submit = tourTarget(ctx, "ssh-submit") as HTMLButtonElement | null;
    const picked = tourTarget(ctx, "ssh-host-picker")?.dataset.host;
    if (submit && !submit.disabled && picked === step.host) press(submit);
    else
      ctx.perform.addProject({ kind: "ssh", name: step.host, host: step.host });
  });
  return {
    moves: [
      pickerMove(ctx, step, "add-project", -3600, 1000),
      pickerMove(ctx, step, "source-ssh", -2700),
      pickerMove(ctx, step, "ssh-host-picker", -1800),
      pickerMove(ctx, step, `ssh-host:${step.host}`, -900),
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => tourTarget(ctx, "ssh-submit"),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

export function chipMoves(
  ctx: TourContext,
  step: StepOf<"agent" | "codex">,
  agent: TourAgent,
  travelMs: number,
): TourStepMoves {
  const finish = finishOnce(ctx, step, (how) => {
    const chip = ctx.chip(agent);
    if (how === "mime") chip?.click();
    else press(chip);
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs,
        target: () => ctx.chip(agent),
        reveal: () => revealInStrip(ctx.container, ctx.chip(agent)),
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

function promptFor(s: TourSnapshot, agent: TourAgent): string {
  const project = s.projects.find((p) => p.name === s.selected);
  return (
    project?.actions.find((a) => a.agent === agent)?.autoPrompt ??
    TOUR_FALLBACK_PROMPT
  );
}

// The session registers itself a render after the chip that opened it was
// clicked, so the prompt waits for the field rather than for the next render.
export function promptMoves(
  ctx: TourContext,
  step: StepOf<"prompt" | "codexPrompt">,
  agent: TourAgent,
): TourStepMoves {
  const finish = finishOnce(ctx, step, (how) => {
    // Landed from the list after the visitor closed the agent's tab, the
    // prompt opens it again rather than waiting on a session that is gone.
    if (how !== "mime" && !hasAgentTab(ctx.snapshot(), ctx.snapshot().selected, agent))
      press(ctx.chip(agent));
    const s = ctx.snapshot();
    const text = promptFor(s, agent);
    const cancel = withAgentDrive(agentDriveKey(s.selected, agent), (drive) => {
      if (drive.idle())
        drive.send(text, how === "quiet" ? { instant: true } : undefined);
    });
    // A landing prompt has to outlive the teardown that asked for it; a mimed
    // one is cancelled with the rest of the sequence.
    if (how === "mime") ctx.onWait(cancel);
  });
  const field = () => {
    const s = ctx.snapshot();
    return agentDrive(agentDriveKey(s.selected, agent))?.field() ?? null;
  };
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 700,
        target: field,
        anchor: "start",
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: () => typingMs(promptFor(ctx.snapshot(), agent)),
  };
}

export function openProjectMoves(
  ctx: TourContext,
  step: StepOf<"openProject">,
): TourStepMoves {
  const row = () => tourTarget(ctx, `project:${step.project}`);
  const finish = finishOnce(ctx, step, (how) => {
    const el = row();
    if (how === "mime" && el) el.click();
    else ctx.perform.visitProject(step.project);
  });
  return {
    moves: [{ offsetMs: 0, travelMs: 900, target: row, act: finish.fire }],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// A sidebar agent row is named by its tab, which an agent's button labels.
const AGENT_LABEL: Record<TourAgent, string> = {
  claude: CLAUDE_ACTION.label,
  codex: CODEX_ACTION.label,
};

export function openAgentMoves(
  ctx: TourContext,
  step: StepOf<"openAgent">,
): TourStepMoves {
  const row = () =>
    tourTarget(ctx, `agent-row:${step.project}:${AGENT_LABEL[step.agent]}`);
  const finish = finishOnce(ctx, step, (how) => {
    const el = row();
    if (how === "mime" && el) el.click();
    else ctx.perform.openAgent(step.project, step.agent);
  });
  return {
    moves: [{ offsetMs: 0, travelMs: 900, target: row, act: finish.fire }],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}

// A session stopped on a question takes its answer through the composer, like
// any other turn.
export function answerMoves(
  ctx: TourContext,
  step: StepOf<"answer">,
): TourStepMoves {
  const key = agentDriveKey(step.project, step.agent);
  const finish = finishOnce(ctx, step, (how) => {
    if (how !== "mime" && !hasAgentTab(ctx.snapshot(), step.project, step.agent))
      press(ctx.chip(step.agent));
    // A session that has only just mounted renders its question a beat after
    // it registers, so the answer waits for it.
    const cancel = withAgentDrive(
      key,
      (drive) =>
        drive.answer(step.text, how === "quiet" ? { instant: true } : undefined),
      (drive) => drive.waiting(),
    );
    if (how === "mime") ctx.onWait(cancel);
  });
  return {
    moves: [
      {
        offsetMs: 0,
        travelMs: 700,
        target: () => agentDrive(key)?.field() ?? null,
        anchor: "start",
        act: finish.fire,
      },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: () => typingMs(step.text),
  };
}

// The row's own menu, opened the way the app opens it at the pointer: a
// right-click on the row, where the cursor tapped.
export function copyMoves(
  ctx: TourContext,
  step: StepOf<"copy">,
): TourStepMoves {
  const row = () => tourTarget(ctx, `project:${step.project}`);
  const item = () => tourTarget(ctx, `row-menu:${step.mode}`);
  const finish = finishOnce(ctx, step, (how) => {
    const el = item();
    if (how === "mime" && el) el.click();
    else ctx.perform.copy(step.project, step.mode);
  });
  const openMenu = () => {
    const el = row();
    if (!el || item() || isDone(ctx, step)) return;
    const box = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width * 0.45,
        clientY: box.top + box.height / 2,
      }),
    );
  };
  return {
    moves: [
      { offsetMs: -1000, travelMs: 900, target: row, act: openMenu },
      { offsetMs: 0, travelMs: 700, target: item, act: finish.fire },
    ],
    land: finish.land,
    latch: finish.latch,
    tailMs: tapTail,
  };
}
