import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Gauge,
  NotebookPen,
  Server,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { AUTOMATIONS_PATH, LINUX_HOST_PATH, TOKEN_USAGE_PATH } from "@/lib/links";

const LINK =
  "font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white";

const CARDS: { icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  {
    icon: Activity,
    title: "Activity across every project",
    body: "One list of every Claude Code and Codex agent, sorted by what needs you first, plus running automations and services you can start or stop. Filter, search, or group it by project.",
  },
  {
    icon: CalendarClock,
    title: "Automations, created on the phone",
    body: (
      <>
        Run, stop, or pause{" "}
        <Link href={AUTOMATIONS_PATH} className={LINK}>
          scheduled automations
        </Link>
        , read each run as a conversation, and reply to it. Build a new one
        with its agent, model, schedule, and checks. They run on your Mac
        while lpm is open.
      </>
    ),
  },
  {
    icon: Gauge,
    title: "Usage limits and token stats",
    body: (
      <>
        See how much of your Claude and Codex 5‑hour and weekly windows is
        left, whether you are ahead of pace, and{" "}
        <Link href={TOKEN_USAGE_PATH} className={LINK}>
          where the tokens went
        </Link>{" "}
        by project and session.
      </>
    ),
  },
  {
    icon: NotebookPen,
    title: "Notes and shared memory",
    body: "Write in a project's encrypted notes, photos included, and browse the work sessions your agents saved to memory. Ask an agent to remember a conversation or pick up a saved one.",
  },
  {
    icon: SlidersHorizontal,
    title: "Configure and add projects",
    body: "Edit a project's services, profiles, and actions with forms, or open its config file. Add a new project from a folder on your Mac, a Git clone, or an SSH host.",
  },
  {
    icon: Server,
    title: "Several Macs and Linux servers",
    body: (
      <>
        Pair more than one Mac, or{" "}
        <Link href={LINUX_HOST_PATH} className={LINK}>
          a Linux server running lpm
        </Link>
        , and switch between them from the title menu. Alerts keep arriving
        from all of them.
      </>
    ),
  },
];

export default function MoreOnPhone() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Beyond the terminal"
          title="The rest of lpm, in your pocket too"
          description="The phone app covers the work around your agents as well: what is running, what is scheduled, what is left on your plan, and which machine it is all on."
          className="mb-12"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARDS.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
