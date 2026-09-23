import { CalendarDays, Hand, Repeat, Timer, type LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { WeekBoardReplica } from "./week-board-replica";

const REPEATS: { icon: LucideIcon; title: string; example: string; body: string }[] = [
  {
    icon: Repeat,
    title: "Every day",
    example: "Every day at 02:00",
    body: "The nightly run. Add more runs a day inside a time window if you need them.",
  },
  {
    icon: CalendarDays,
    title: "On certain days",
    example: "Mondays and Thursdays at 18:00",
    body: "Pick the weekdays, or let lpm use only a few of them at random each week.",
  },
  {
    icon: Timer,
    title: "On an interval",
    example: "Every 4–8 hours",
    body: "A fixed gap, or a random one inside a range, in minutes, hours or days.",
  },
  {
    icon: Hand,
    title: "Manually",
    example: "Runs only when you start it",
    body: "Keep a ready-made job for when you need it, and run it with one click.",
  },
];

export default function Schedules() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Schedules"
          title="Nightly, on weekdays, or every few hours"
          description="No cron syntax to remember. Pick a rhythm and the editor spells out in plain English when the job will run."
          className="mb-12"
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPEATS.map(({ icon: Icon, title, example, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 bg-gray-50/40 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
                {title}
              </span>
              <p className="mt-3 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[12px] text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-white/[0.06]">
                {example}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {body}
              </p>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-3xl text-pretty text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          A job set for a fixed time starts within a few minutes of it, so jobs
          set for the same hour don&apos;t all begin at once. Or give it a window
          and lpm picks a different time inside it each day. Intervals can be as
          short as 5 minutes.
        </p>

        <figure className="mt-12">
          <WeekBoardReplica />
          <figcaption className="mx-auto mt-4 max-w-2xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            The Week view: when every job fires, colored by project. Past slots
            show how the run went; random times show as expected slots.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
