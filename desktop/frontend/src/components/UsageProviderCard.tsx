import type { ReactNode } from "react";
import type { ProviderLimits } from "../hooks/useAgentLimits";
import type { LimitRemindersState } from "../hooks/useLimitReminders";
import { reminderFor, remindable, type ReminderWindow } from "../limitReminders";
import {
  FIVE_HOUR_MS,
  STALE_MS,
  WEEKLY_MS,
  providerMeta,
  updatedText,
} from "./stats/limitsFormat";
import { UsageMeter } from "./UsageMeter";

interface UsageProviderCardProps {
  data: ProviderLimits;
  now: number;
  title: string;
  subtitle?: string;
  /** Extra line under the meters — the sidebar's popover adds the day's spend,
   *  which the windows themselves do not carry. */
  footer?: ReactNode;
  /** One meter under the other, for the sidebar's narrow hover card. */
  stacked?: boolean;
  /** Leads with the 5-hour meter, for a sidebar row whose own window is it. */
  fiveHourFirst?: boolean;
  /** Offers reset reminders, for the card whose limits are `limitKey` in the snapshot. */
  reminders?: LimitRemindersState;
  limitKey?: string;
}

export function UsageProviderCard({
  data,
  now,
  title,
  subtitle,
  footer,
  stacked = false,
  fiveHourFirst = false,
  reminders,
  limitKey,
}: UsageProviderCardProps) {
  const meta = providerMeta(data.provider);
  const stale = now - data.updatedAt > STALE_MS;
  const weekly = {
    label: "Weekly",
    id: "weekly" as ReminderWindow,
    win: data.weekly,
    windowMs: WEEKLY_MS,
  };
  const fiveHour = {
    label: "5-hour",
    id: "fiveHour" as ReminderWindow,
    win: data.fiveHour,
    windowMs: FIVE_HOUR_MS,
  };
  const reminderOf = (meter: typeof weekly) => {
    if (!reminders || !limitKey || !meter.win) return undefined;
    const set = !!reminderFor(reminders.reminders, limitKey, meter.id);
    if (!remindable(meter.win, now, set)) return undefined;
    const resetsAt = meter.win.resetsAt;
    return { set, onToggle: () => reminders.toggle(limitKey, meter.id, resetsAt, title) };
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <header
        className={`flex items-center gap-2 border-b border-[var(--border)]/50 pb-3 ${stacked ? "flex-wrap gap-y-1" : ""}`}
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: meta.dot, opacity: stale ? 0.5 : 1 }}
        />
        <span className="shrink-0 text-sm font-medium tracking-tight text-[var(--text-primary)]">
          {title}
        </span>
        {subtitle && (
          <span
            className={`min-w-0 truncate text-[11px] text-[var(--text-muted)] ${stacked ? "order-last basis-full pl-4" : ""}`}
          >
            {subtitle}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {data.label && (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              {data.label}
            </span>
          )}
          <span
            className="text-[11px] tabular-nums text-[var(--text-muted)]"
            style={{ opacity: stale ? 0.6 : 1 }}
          >
            {updatedText(data.updatedAt, now)}
          </span>
        </div>
      </header>

      <div className={`grid gap-x-6 gap-y-5 pt-4 ${stacked ? "grid-cols-1" : "grid-cols-2"}`}>
        {(fiveHourFirst ? [fiveHour, weekly] : [weekly, fiveHour]).map((meter, i) => (
          <UsageMeter
            key={meter.label}
            label={meter.label}
            win={meter.win}
            windowMs={meter.windowMs}
            now={now}
            stale={stale}
            thin={stacked && i === 1}
            reminder={reminderOf(meter)}
          />
        ))}
      </div>

      {footer && (
        <div className="mt-4 border-t border-[var(--border)]/50 pt-3 text-[11px] tabular-nums text-[var(--text-muted)]">
          {footer}
        </div>
      )}
    </section>
  );
}
