import { Bell, BellOff } from "lucide-react";
import type { DemoAlerts } from "./use-demo-alerts";

export function DemoAlertsToggle({ alerts }: { alerts: DemoAlerts }) {
  if (!alerts.supported) return null;
  const { on, blocked, toggle } = alerts;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] text-gray-500 dark:text-gray-400">
      <span>
        {blocked
          ? "Notifications are blocked for this site in your browser."
          : on
            ? "On. Ask an agent something in the window, then switch tabs: you'll be told when it answers. In the app, your phone is too."
            : "Want the demo to call you back the way lpm does? Turn this on, ask an agent something, and switch tabs."}
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        disabled={blocked}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-gray-200 px-3 font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
      >
        {on ? (
          <Bell className="h-4 w-4" aria-hidden />
        ) : (
          <BellOff className="h-4 w-4" aria-hidden />
        )}
        Notify me like lpm would
        <span
          aria-hidden="true"
          className={`relative h-[18px] w-[30px] rounded-full transition-colors ${
            on ? "bg-gray-900 dark:bg-white" : "bg-gray-300 dark:bg-white/20"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-[left] dark:bg-gray-900 ${
              on ? "left-[14px]" : "left-[2px]"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
