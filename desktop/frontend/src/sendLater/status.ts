import type { ScheduledPrompt, SendLaterHold } from "../store/sendLater";
import { clockLabel, countdownLabel, shortWhenLabel } from "./time";

export type PromptTone = "scheduled" | "waiting" | "missed";

export interface PromptStatus {
  tone: PromptTone;
  // What the prompt is doing, in a few words: its time, or why it's waiting.
  title: string;
  // The time it was set for, when the title doesn't already say it.
  detail: string | null;
}

export function promptStatus(item: ScheduledPrompt, hold: SendLaterHold | undefined, now: number): PromptStatus {
  const label = item.terminalLabel || "the agent";
  if (item.state === "missed") {
    return { tone: "missed", title: `Missed · was due ${shortWhenLabel(item.dueAt, now)}`, detail: null };
  }
  if (item.state === "due") {
    const title =
      hold === "asking"
        ? `Waiting for your answer in ${label}`
        : hold === "away"
          ? `Waiting for ${label} to open`
          : `Waiting for ${label} to finish`;
    return { tone: "waiting", title, detail: `due ${clockLabel(item.dueAt)} · sends when it's ready` };
  }
  return {
    tone: "scheduled",
    title: `${shortWhenLabel(item.dueAt, now)} · ${countdownLabel(item.dueAt, now)}`,
    detail: null,
  };
}

const TONE_RANK: Record<PromptTone, number> = { waiting: 0, missed: 1, scheduled: 2 };

// The tone a mark shows for several prompts: the one that most needs the eye.
export function strongestTone(tones: PromptTone[]): PromptTone | null {
  if (tones.length === 0) return null;
  return tones.reduce((a, b) => (TONE_RANK[b] < TONE_RANK[a] ? b : a));
}
