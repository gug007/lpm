import { create } from "zustand";
import {
  SendLaterAdd,
  SendLaterList,
  SendLaterRemove,
  SendLaterReschedule,
  SendLaterSendNow,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

// Prompts waiting to be sent later. The backend owns the list and its clock (it
// marks each one due or missed); every window mirrors it here for display, and
// the main window's runner does the sending.

export type ScheduledPromptState = "scheduled" | "due" | "missed";
export type ScheduledPromptKind = "time" | "limit";

export interface ScheduledPrompt {
  id: string;
  projectName: string;
  // The terminal tab's persisted key; its live id changes on every launch.
  historyKey: string;
  terminalLabel: string;
  // Serialized like the composer, with "[Image #N]" tokens.
  text: string;
  images: Record<string, string>;
  dueAt: number;
  createdAt: number;
  state: ScheduledPromptState;
  kind: ScheduledPromptKind;
  // Send now: it goes out without waiting for the agent to finish.
  force: boolean;
}

export type NewScheduledPrompt = Pick<
  ScheduledPrompt,
  "projectName" | "historyKey" | "terminalLabel" | "text" | "images" | "dueAt" | "kind"
>;

// Why a due prompt hasn't gone out yet. Known only to the window that sends.
export type SendLaterHold = "busy" | "asking" | "away";

interface SendLaterStoreState {
  items: ScheduledPrompt[];
  // False until the first list arrives, so an empty list isn't mistaken for one.
  loaded: boolean;
  holds: Record<string, SendLaterHold>;
}

export const useSendLater = create<SendLaterStoreState>(() => ({
  items: [],
  loaded: false,
  holds: {},
}));

const byDue = (a: ScheduledPrompt, b: ScheduledPrompt) => a.dueAt - b.dueAt;

function applyList(list: ScheduledPrompt[] | null | undefined) {
  const items = [...(list ?? [])].sort(byDue);
  const live = new Set(items.map((i) => i.id));
  useSendLater.setState((s) => {
    const holds = Object.fromEntries(Object.entries(s.holds).filter(([id]) => live.has(id)));
    return { items, holds, loaded: true };
  });
}

let started = false;

export async function initSendLater(): Promise<void> {
  if (started) return;
  started = true;
  EventsOn("send-later-changed", (list: ScheduledPrompt[]) => applyList(list));
  try {
    applyList((await SendLaterList()) as ScheduledPrompt[]);
  } catch {
    /* an older backend without the list keeps it empty */
  }
}

export async function schedulePrompt(prompt: NewScheduledPrompt): Promise<ScheduledPrompt> {
  return (await SendLaterAdd(prompt)) as ScheduledPrompt;
}

export function reschedulePrompt(id: string, dueAt: number, kind?: ScheduledPromptKind): Promise<void> {
  return SendLaterReschedule(id, dueAt, kind ?? null);
}

export function sendPromptNow(id: string): Promise<void> {
  return SendLaterSendNow(id);
}

export async function removePrompt(id: string): Promise<ScheduledPrompt | null> {
  return ((await SendLaterRemove(id)) as ScheduledPrompt | null) ?? null;
}

export function setHold(id: string, hold: SendLaterHold | null): void {
  useSendLater.setState((s) => {
    if ((s.holds[id] ?? null) === hold) return s;
    const holds = { ...s.holds };
    if (hold) holds[id] = hold;
    else delete holds[id];
    return { holds };
  });
}

export function promptsFor(items: ScheduledPrompt[], historyKey: string): ScheduledPrompt[] {
  return items.filter((i) => i.historyKey === historyKey);
}

// The terminal's time for a prompt it put back in the input to edit: reopening
// Send later there starts from that time instead of the last one used.
const editedTimes = new Map<string, number>();

export function rememberEditedTime(historyKey: string, dueAt: number): void {
  editedTimes.set(historyKey, dueAt);
}

export function takeEditedTime(historyKey: string): number | null {
  const at = editedTimes.get(historyKey) ?? null;
  editedTimes.delete(historyKey);
  return at;
}
