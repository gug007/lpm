import type { LimitWindow } from "./hooks/useAgentLimits";

export type ReminderWindow = "fiveHour" | "weekly";

// A reminder that a usage limit has reset, kept by this Mac for the desktop and
// every paired phone (limit_reminders.rs).
export interface LimitReminder {
  limit: string;
  window: ReminderWindow;
  resetsAt: number; // unix seconds, as the limits snapshot gave it
  name: string;
}

// Usage from which a window offers the reminder: before that, its reset is
// rarely something worth waiting for.
export const REMIND_FROM_PERCENT = 80;

export function reminderFor(
  reminders: LimitReminder[],
  limit: string,
  window: ReminderWindow,
): LimitReminder | undefined {
  return reminders.find((r) => r.limit === limit && r.window === window);
}

// Whether a window shows the bell: a live reading near or at its limit, or one
// that already has a reminder set.
export function remindable(win: LimitWindow | undefined, now: number, set: boolean): boolean {
  if (!win || win.resetsAt <= 0 || win.resetsAt * 1000 <= now) return false;
  return set || win.usedPercent >= REMIND_FROM_PERCENT;
}
