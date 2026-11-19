import { isWhenDone, type ScheduledPrompt, type SendLaterHold } from "../store/sendLater";
import { repeatLabel } from "./repeat";
import { countdownLabel, shortWhenLabel } from "./time";

// What a prompt queued for "when done" waits on: the agent, or for a plain
// shell, the command running in it.
export function whenDoneSubject(agent: string, terminalLabel: string): string {
  const label = terminalLabel || "the agent";
  return agent ? label : `the command in ${label}`;
}

// "Queued" for a prompt waiting on its agent, "Scheduled" for one set for a time.
export function promptNoun(item: Pick<ScheduledPrompt, "kind">): string {
  return isWhenDone(item) ? "Queued" : "Scheduled";
}

const HOLD_TITLES: Partial<Record<SendLaterHold, (label: string) => string>> = {
  asking: (label) => `Waiting for your answer in ${label}`,
  away: (label) => `Waiting for ${label} to open`,
  starting: (label) => `Waiting for ${label} to start`,
  problem: (label) => `Paused · ${label} hit a problem`,
};

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
  const whenDone = isWhenDone(item);
  if (item.state === "missed") {
    const title = whenDone
      ? `Missed · lpm closed before ${label} finished`
      : `Missed · was due ${shortWhenLabel(item.dueAt, now)}`;
    return { tone: "missed", title, detail: null };
  }
  if (item.state === "due") {
    const held = hold && HOLD_TITLES[hold];
    const title = held
      ? held(label)
      : whenDone
        ? `Next, when ${whenDoneSubject(item.agent, item.terminalLabel)} finishes`
        : `Waiting for ${label} to finish`;
    const detail =
      hold === "problem"
        ? "Send now sends it anyway"
        : whenDone
          ? `queued ${shortWhenLabel(item.createdAt, now)}`
          : `due ${shortWhenLabel(item.dueAt, now)} · sends when it's ready`;
    return { tone: "waiting", title, detail };
  }
  const every = repeatLabel(item.repeatMs);
  return {
    tone: "scheduled",
    title: `${shortWhenLabel(item.dueAt, now)} · ${countdownLabel(item.dueAt, now)}`,
    detail: every ? `Repeats ${every}` : null,
  };
}

const TONE_RANK: Record<PromptTone, number> = { waiting: 0, missed: 1, scheduled: 2 };

// The tone a mark shows for several prompts: the one that most needs the eye.
export function strongestTone(tones: PromptTone[]): PromptTone | null {
  if (tones.length === 0) return null;
  return tones.reduce((a, b) => (TONE_RANK[b] < TONE_RANK[a] ? b : a));
}
