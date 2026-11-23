// Automations started by something lpm sees happen instead of by the clock
// (src-tauri/src/jobs/events.rs): the `schedule: { on: … }` block, its words,
// and the editor draft's side of it.

import type { JobDraft } from "./jobsFormat";

export type JobEventKind = "ciFailed" | "serviceCrashed" | "agentFinished";
export type JobEventLimit = "commit" | "day";

export interface JobEventSchedule {
  mode: "event";
  on: JobEventKind;
  branches?: string[];
  services?: string[];
  from?: string[];
  atMost: JobEventLimit;
}

export const EVENT_OPTIONS: { value: JobEventKind; label: string }[] = [
  { value: "ciFailed", label: "CI fails" },
  { value: "serviceCrashed", label: "A service crashes" },
  { value: "agentFinished", label: "An agent finishes" },
];

export const EVENT_LIMIT_OPTIONS: { value: JobEventLimit; label: string }[] = [
  { value: "commit", label: "Once per commit" },
  { value: "day", label: "Once a day" },
];

// What each event needs said about it under the editor's card.
export const EVENT_NOTES: Record<JobEventKind, string> = {
  ciFailed:
    "Follows commits pushed from this computer, with the GitHub CLI signed in. Once per commit, it stops after 3 runs in a row on a branch until CI passes there.",
  serviceCrashed: "Noticed within a minute of a service exiting with an error.",
  agentFinished: "Runs a prompt or a command: an action's own agent would start it again.",
};

function isEventKind(value: unknown): value is JobEventKind {
  return EVENT_OPTIONS.some((o) => o.value === value);
}

// "a, b or c".
function orWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

// "When CI fails on main", "When api crashes", "When an agent finishes in
// docs-site, once a day". lpm Link's AutomationFormat words it the same way.
export function formatEvent(schedule: JobEventSchedule): string {
  let text: string;
  if (schedule.on === "ciFailed") {
    text = schedule.branches?.length ? `When CI fails on ${orWords(schedule.branches)}` : "When CI fails";
  } else if (schedule.on === "serviceCrashed") {
    text = schedule.services?.length ? `When ${orWords(schedule.services)} crashes` : "When a service crashes";
  } else {
    text = schedule.from?.length
      ? `When an agent finishes in ${orWords(schedule.from)}`
      : "When an agent finishes";
  }
  return schedule.atMost === "day" ? `${text}, once a day` : text;
}

// The comma-separated names typed into an editor row.
export function splitNames(text: string): string[] {
  const names: string[] = [];
  for (const name of text.split(",").map((n) => n.trim())) {
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function readNames(value: unknown): string[] {
  if (typeof value === "string") return splitNames(value);
  if (!Array.isArray(value)) return [];
  return splitNames(value.filter((v): v is string => typeof v === "string").join(","));
}

// The filter the chosen event uses, and only that one.
function eventFilters(draft: JobDraft): Pick<JobEventSchedule, "branches" | "services" | "from"> {
  const names = splitNames(
    draft.eventOn === "ciFailed"
      ? draft.eventBranches
      : draft.eventOn === "serviceCrashed"
        ? draft.eventServices
        : draft.eventFrom,
  );
  if (names.length === 0) return {};
  if (draft.eventOn === "ciFailed") return { branches: names };
  if (draft.eventOn === "serviceCrashed") return { services: names };
  return { from: names };
}

export function draftToEventSchedule(draft: JobDraft): JobEventSchedule {
  return { mode: "event", on: draft.eventOn, ...eventFilters(draft), atMost: draft.eventAtMost };
}

export function eventBlockFromDraft(draft: JobDraft): Record<string, unknown> {
  const block: Record<string, unknown> = { on: draft.eventOn, ...eventFilters(draft) };
  if (draft.eventAtMost === "day") block.atMost = "day";
  return block;
}

// Reads `schedule: { on: … }` into the draft; false when it isn't an event's.
export function readEventIntoDraft(draft: JobDraft, s: Record<string, unknown>): boolean {
  if (typeof s.on !== "string" || !s.on.trim()) return false;
  draft.scheduleKind = "event";
  if (isEventKind(s.on)) draft.eventOn = s.on;
  draft.eventBranches = readNames(s.branches).join(", ");
  draft.eventServices = readNames(s.services).join(", ");
  draft.eventFrom = readNames(s.from).join(", ");
  draft.eventAtMost = s.atMost === "day" ? "day" : "commit";
  return true;
}

export function validateEventDraft(draft: JobDraft): string | null {
  if (draft.eventOn === "agentFinished" && draft.runMode === "action") {
    return "An agent finishing can start a prompt or a command, not an action.";
  }
  return null;
}
