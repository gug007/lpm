import type { CommandMap } from "../backend";
import type { LimitReminder, ReminderWindow } from "../../limitReminders";

let reminders: LimitReminder[] = [];

const others = (limit: unknown, window: unknown) =>
  reminders.filter((r) => !(r.limit === limit && r.window === window));

export const reminderCommands: CommandMap = {
  limit_reminders: () => reminders,
  set_limit_reminder: ({ limit, window, resetsAt, name }) => {
    reminders = [
      ...others(limit, window),
      {
        limit: String(limit),
        window: window as ReminderWindow,
        resetsAt: Number(resetsAt),
        name: String(name),
      },
    ].sort((a, b) => a.resetsAt - b.resetsAt);
    return reminders;
  },
  clear_limit_reminder: ({ limit, window }) => {
    reminders = others(limit, window);
    return reminders;
  },
};
