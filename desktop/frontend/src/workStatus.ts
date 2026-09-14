import type { CustomWorkStatus, ProjectInfo, WorkState, WorkStatus } from "./types";

type BuiltInWorkState = Exclude<WorkState, "custom">;

export const WORK_STATE_LABEL: Record<BuiltInWorkState, string> = {
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** Blocked is the one state whose word takes colour, in the note line under a
 *  row and in a folded deck's counts; the emoji marks carry the rest. */
export const BLOCKED_TONE_CLASS = "text-[var(--accent-rose-text)]";

const WORK_STATE_EMOJI: Record<BuiltInWorkState, string> = {
  in_progress: "⏳",
  blocked: "⛔",
  done: "✅",
};

/** What a menu choice applies; the host stamps `since`. */
export type WorkStatusInput = Omit<WorkStatus, "since">;

type StatusIdentity = Pick<WorkStatus, "state" | "label">;

/** The one rule for "the same status": the state, and the label when custom. */
export function workStatusKey(status: StatusIdentity): string {
  return status.state === "custom" ? `custom:${status.label ?? ""}` : status.state;
}

export function sameWorkStatus(a: StatusIdentity | undefined, b: StatusIdentity): boolean {
  return a !== undefined && workStatusKey(a) === workStatusKey(b);
}

export function workStatusLabel(status: StatusIdentity): string {
  return status.state === "custom" ? (status.label ?? "") : WORK_STATE_LABEL[status.state];
}

export function workStatusEmoji(status: Pick<WorkStatus, "state" | "emoji">): string {
  return status.state === "custom" ? (status.emoji ?? "") : WORK_STATE_EMOJI[status.state];
}

/** The line a row carries under its name: Blocked's reason, or what a status
 *  that asks for one was told. */
export function workStatusNote(status: WorkStatus | undefined): string | null {
  const note = status?.note?.trim();
  return note ? note : null;
}

/** What a row's mark says on hover: the name, and the note under it. */
export function workStatusTitle(status: WorkStatus): string {
  const label = workStatusLabel(status);
  const note = workStatusNote(status);
  return note ? `${label}\n${note}` : label;
}

/** One row of the Status menu: what it applies, how it reads, and whether
 *  applying it asks for a line first. */
export interface WorkStatusChoice {
  input: WorkStatusInput;
  label: string;
  emoji: string;
  asksNote: boolean;
}

function builtIn(state: BuiltInWorkState): WorkStatusChoice {
  return {
    input: { state },
    label: WORK_STATE_LABEL[state],
    emoji: WORK_STATE_EMOJI[state],
    asksNote: state === "blocked",
  };
}

export function customWorkStatusChoice(entry: CustomWorkStatus): WorkStatusChoice {
  return {
    input: { state: "custom", label: entry.label, emoji: entry.emoji },
    label: entry.label,
    emoji: entry.emoji,
    asksNote: entry.withNote === true,
  };
}

// Statuses that ship with the app but are stored the way a user's own are —
// as `custom` with their label and emoji on the row — so the host needs no
// new vocabulary and a row still reads on a Mac whose palette differs. They
// are fixed all the same: nobody can edit or remove them.
const REVIEW: CustomWorkStatus = { label: "Review", emoji: "👀", withNote: true };
const READY: CustomWorkStatus = { label: "Ready", emoji: "🚀" };
const WAITING: CustomWorkStatus = { label: "Waiting", emoji: "⏰", withNote: true };
const NEEDS_DECISION: CustomWorkStatus = { label: "Needs decision", emoji: "❓", withNote: true };
const PAUSED: CustomWorkStatus = { label: "Paused", emoji: "⏸️", withNote: true };

/** The five that ship beside the three states. The host keeps an identical
 *  list (SHIPPED_WORK_STATUSES in config.rs) and always serves them first;
 *  edit both or neither. */
export const SHIPPED_WORK_STATUSES: CustomWorkStatus[] = [
  REVIEW,
  READY,
  WAITING,
  NEEDS_DECISION,
  PAUSED,
];

export function isShippedWorkStatusLabel(label: string): boolean {
  const wanted = label.trim().toLowerCase();
  return SHIPPED_WORK_STATUSES.some((s) => s.label.toLowerCase() === wanted);
}

/** Everything the menu always offers. Anything else in it is the palette:
 *  the statuses the user added. */
export const BUILT_IN_WORK_STATUSES: WorkStatusChoice[] = [
  builtIn("in_progress"),
  builtIn("blocked"),
  builtIn("done"),
  ...SHIPPED_WORK_STATUSES.map(customWorkStatusChoice),
];

const customKey = (entry: CustomWorkStatus) =>
  workStatusKey({ state: "custom", label: entry.label });

// Where the work is in its life in the order it moves through them, then why
// it is not moving, hardest to lift first. The user can reorder the menu, so
// this is only where a status starts out.
export const DEFAULT_WORK_STATUS_ORDER: string[] = [
  workStatusKey({ state: "in_progress" }),
  customKey(REVIEW),
  customKey(READY),
  workStatusKey({ state: "done" }),
  workStatusKey({ state: "blocked" }),
  customKey(WAITING),
  customKey(NEEDS_DECISION),
  customKey(PAUSED),
];

export function workStatusChoiceKey(choice: WorkStatusChoice): string {
  return workStatusKey(choice.input);
}

/** The Status menu: the built-in statuses and the user's own, in the order
 *  they were dragged into. A status the order says nothing about keeps its
 *  default place, after the ones it does. A palette entry named like a
 *  shipped status is a leftover from when those were editable, and is ignored. */
export function workStatusMenu(
  palette: CustomWorkStatus[],
  order?: string[],
): WorkStatusChoice[] {
  const own = palette.filter((s) => !isShippedWorkStatusLabel(s.label));
  const choices = [...BUILT_IN_WORK_STATUSES, ...own.map(customWorkStatusChoice)];
  const ranked = order && order.length > 0 ? order : DEFAULT_WORK_STATUS_ORDER;
  const rank = new Map<string, number>();
  ranked.forEach((key, i) => {
    if (!rank.has(key)) rank.set(key, i);
  });
  const placed = (choice: WorkStatusChoice) =>
    rank.get(workStatusChoiceKey(choice)) ?? Number.MAX_SAFE_INTEGER;
  return choices
    .map((choice, i) => ({ choice, i }))
    .sort((a, b) => placed(a.choice) - placed(b.choice) || a.i - b.i)
    .map((entry) => entry.choice);
}

/** A rename keeps the status where the user put it; a nameless one is no
 *  rename at all, the same way editing one refuses it. */
export function renameInWorkStatusOrder(
  order: string[] | undefined,
  oldLabel: string,
  newLabel: string,
): string[] | undefined {
  const old = workStatusKey({ state: "custom", label: oldLabel });
  const label = newLabel.trim();
  if (!label || !order?.includes(old)) return order;
  const next = workStatusKey({ state: "custom", label });
  return order.map((key) => (key === old ? next : key));
}

export function removeFromWorkStatusOrder(
  order: string[] | undefined,
  label: string,
): string[] | undefined {
  const key = workStatusKey({ state: "custom", label });
  return order?.filter((k) => k !== key);
}

/** Where a name is already taken: by a status the menu ships with, by one of
 *  the user's own, or nowhere. `editing` names the status being renamed, whose own
 *  name stays free. */
export function workStatusNameClash(
  palette: CustomWorkStatus[],
  label: string,
  editing: string | null,
): "menu" | "yours" | null {
  const wanted = label.trim().toLowerCase();
  if (BUILT_IN_WORK_STATUSES.some((c) => c.label.toLowerCase() === wanted)) return "menu";
  if (palette.some((s) => s.label !== editing && s.label.toLowerCase() === wanted)) return "yours";
  return null;
}

/** The note already on the row, when the choice keeps the same status — so
 *  re-applying it edits the line rather than starting from blank. */
export function existingNoteFor(
  current: WorkStatus | undefined,
  input: WorkStatusInput,
): string {
  return current && sameWorkStatus(current, input) ? (current.note ?? "") : "";
}

function normalizeWorkStatusInput(input: WorkStatusInput): WorkStatusInput | null {
  const custom = input.state === "custom";
  const label = custom ? input.label?.trim() : undefined;
  if (custom && !label) return null;
  const emoji = custom ? input.emoji?.trim() || undefined : undefined;
  const note = input.note?.trim() || undefined;
  return {
    state: input.state,
    ...(label ? { label } : {}),
    ...(emoji ? { emoji } : {}),
    ...(note ? { note } : {}),
  };
}

/** What the row shows the instant the menu closes, before the host confirms.
 *  A note-only edit keeps the clock; a change of status restarts it. */
export function nextWorkStatus(
  current: WorkStatus | undefined,
  input: WorkStatusInput | null,
  now: number,
): WorkStatus | undefined {
  if (!input) return undefined;
  const next = normalizeWorkStatusInput(input);
  if (!next) return current;
  return { ...next, since: current && sameWorkStatus(current, next) ? current.since : now };
}

function normalizeCustomWorkStatus(entry: CustomWorkStatus): CustomWorkStatus | null {
  const label = entry.label.trim();
  if (!label) return null;
  return { label, emoji: entry.emoji, ...(entry.withNote ? { withNote: true } : {}) };
}

/** Adding a name that is already there gives it the new emoji and setting
 *  rather than doubling it. */
export function addCustomWorkStatus(
  list: CustomWorkStatus[],
  entry: CustomWorkStatus,
): CustomWorkStatus[] {
  const next = normalizeCustomWorkStatus(entry);
  if (!next) return list;
  return [...list.filter((s) => s.label.toLowerCase() !== next.label.toLowerCase()), next];
}

/** Editing keeps the status's place in the list. */
export function updateCustomWorkStatus(
  list: CustomWorkStatus[],
  oldLabel: string,
  entry: CustomWorkStatus,
): CustomWorkStatus[] {
  const next = normalizeCustomWorkStatus(entry);
  if (!next) return list;
  return list.map((s) => (s.label === oldLabel ? next : s));
}

export function removeCustomWorkStatus(
  list: CustomWorkStatus[],
  label: string,
): CustomWorkStatus[] {
  return list.filter((s) => s.label !== label);
}

/** The rows wearing a status that was just edited, and what to give each so
 *  it follows the edit — keeping the line it already carries. */
export function retagWorkStatus(
  projects: Pick<ProjectInfo, "name" | "workStatus">[],
  oldLabel: string,
  entry: CustomWorkStatus,
): { name: string; input: WorkStatusInput }[] {
  const old: StatusIdentity = { state: "custom", label: oldLabel };
  return projects
    .filter((p) => sameWorkStatus(p.workStatus, old))
    .map((p) => ({
      name: p.name,
      input: { state: "custom", label: entry.label, emoji: entry.emoji, note: p.workStatus?.note },
    }));
}
