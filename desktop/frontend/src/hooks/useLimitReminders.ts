import { useCallback, useEffect, useState } from "react";
import { toast } from "../notifications/toast";
import { ClearLimitReminder, LimitReminders, SetLimitReminder } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { reminderFor, type LimitReminder, type ReminderWindow } from "../limitReminders";

const CHANGED_EVENT = "limit-reminders-changed";

export interface LimitRemindersState {
  reminders: LimitReminder[];
  toggle: (limit: string, window: ReminderWindow, resetsAt: number, name: string) => void;
}

// This Mac's limit reminders, kept current as the desktop or a phone changes
// them and as they fire.
export function useLimitReminders(): LimitRemindersState {
  const [reminders, setReminders] = useState<LimitReminder[]>([]);

  useEffect(() => {
    let alive = true;
    LimitReminders()
      .then((list) => alive && setReminders(list ?? []))
      .catch(() => {});
    const off = EventsOn(CHANGED_EVENT, (list: LimitReminder[] | null) => setReminders(list ?? []));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const toggle = useCallback(
    (limit: string, window: ReminderWindow, resetsAt: number, name: string) => {
      const change = reminderFor(reminders, limit, window)
        ? ClearLimitReminder(limit, window)
        : SetLimitReminder(limit, window, resetsAt, name);
      change.then((list) => setReminders(list ?? [])).catch((err) => toast.error(String(err)));
    },
    [reminders],
  );

  return { reminders, toggle };
}
