import {
  Activity,
  BellRing,
  CalendarClock,
  Gauge,
  GitPullRequestArrow,
  type LucideIcon,
} from "lucide-react";

const CAPABILITIES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Activity,
    title: "Activity",
    body: "Claude Code and Codex sessions across your projects, needs-you first.",
  },
  {
    icon: CalendarClock,
    title: "Automations",
    body: "Run, pause or edit scheduled tasks and read every run.",
  },
  {
    icon: GitPullRequestArrow,
    title: "Git review",
    body: "Read the diff, commit with an AI-written message, open a GitHub PR.",
  },
  {
    icon: BellRing,
    title: "Push notifications",
    body: "When Claude Code or Codex needs you or finishes, and when automations end.",
  },
  {
    icon: Gauge,
    title: "Usage limits",
    body: "Claude and Codex 5\u2011hour and weekly windows, and your pace.",
  },
];

export function DevicesCapabilities() {
  return (
    <div>
      <h3 className="text-center text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Also in the iPhone app
      </h3>
      {/* Five items: two plain columns of labels on a phone, then three over
          two (the pair centred on a six-track grid), then one row. */}
      <ul className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-x-4 gap-y-3 sm:mt-6 sm:max-w-none sm:grid-cols-6 sm:gap-x-6 sm:gap-y-6 lg:grid-cols-5">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex items-center gap-2 sm:col-span-2 sm:items-start sm:gap-3 sm:nth-4:col-start-2 lg:col-span-1 lg:nth-4:col-start-auto"
          >
            <span className="flex shrink-0 items-center justify-center text-gray-500 sm:h-8 sm:w-8 sm:rounded-lg sm:bg-white sm:text-gray-700 sm:ring-1 sm:ring-gray-200 dark:text-gray-400 sm:dark:bg-white/[0.06] sm:dark:text-gray-300 sm:dark:ring-white/[0.08]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-gray-900 sm:text-sm dark:text-gray-100">
                {title}
              </span>
              <span className="mt-0.5 hidden text-[13px] leading-snug text-gray-600 sm:block dark:text-gray-400">
                {body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
