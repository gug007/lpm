import { createContext } from "react";
import { EventsOnReady } from "../../bridge/runtime";
import type { ActionRunCapture } from "../hooks/actionRunCapture";
import type { ActionInfo } from "../types";

// What a page's `lpm.run` resolves with (see mobile/shared/web/popup/bootstrap.js).
export interface PageRunResult {
  ok: boolean;
  output?: string;
  error?: string;
  canceled?: boolean;
}

export type PageRunner = (action: string, inputs: Record<string, string>) => Promise<PageRunResult>;

// Runs what a page in the project's view asks for, as the action's button would.
export const PageRunContext = createContext<PageRunner | null>(null);

export interface PageRunAsk {
  id: string;
  action: string;
  inputs: Record<string, string>;
}

// The newest part of a run's output a page gets back.
const MAX_OUTPUT = 256 * 1024;
// SGR colors, which lines keep for the run card.
const COLORS = /\x1b\[[0-9;:]*m/g;

export function pageRunAskOf(message: unknown): PageRunAsk | null {
  const ask = (message as { lpmRun?: unknown } | null)?.lpmRun as Partial<PageRunAsk> | undefined;
  if (!ask || typeof ask.id !== "string" || typeof ask.action !== "string") return null;
  const inputs: Record<string, string> = {};
  if (ask.inputs && typeof ask.inputs === "object") {
    for (const [key, value] of Object.entries(ask.inputs)) {
      if (typeof value === "string") inputs[key] = value;
    }
  }
  return { id: ask.id, action: ask.action, inputs };
}

export function isPageRefresh(message: unknown): boolean {
  return (message as { lpmRefresh?: unknown } | null)?.lpmRefresh === true;
}

// The values a page gave the action's inputs, each one the input takes, and
// whether they leave nothing to ask.
export function givenInputs(action: ActionInfo, given: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const input of action.inputs ?? []) {
    const value = given[input.key];
    if (value === undefined || (input.required && !value.trim())) continue;
    if (input.options?.length && !input.options.some((option) => option.value === value)) continue;
    values[input.key] = value;
  }
  const complete = (action.inputs ?? []).every((input) => input.key in values);
  return { values, complete };
}

export function pageOutput(lines: string[]): string {
  const text = lines.join("\n").replace(COLORS, "");
  return text.length > MAX_OUTPUT ? text.slice(text.length - MAX_OUTPUT) : text;
}

// Tells `done` how a quick run ended, then lets its capture go.
export function whenRunEnds(capture: ActionRunCapture, done: (result: PageRunResult) => void) {
  let off: () => void = () => {};
  const check = () => {
    const snap = capture.snapshot();
    if (!snap.done) return;
    off();
    capture.dispose();
    done({ ok: snap.done.success, output: pageOutput(snap.lines), error: snap.done.error });
  };
  off = capture.subscribe(check);
  check();
}

// A background run's lines, gathered from before it starts.
export async function collectRunLines(runId: string) {
  const lines: string[] = [];
  let size = 0;
  const off = await EventsOnReady("action-bg-output", (data: { runId?: string; line?: string }) => {
    if (data?.runId !== runId || typeof data.line !== "string") return;
    lines.push(data.line);
    size += data.line.length + 1;
    while (size > MAX_OUTPUT && lines.length > 1) size -= lines.shift()!.length + 1;
  });
  return {
    output: () => pageOutput(lines),
    dispose: off,
  };
}
