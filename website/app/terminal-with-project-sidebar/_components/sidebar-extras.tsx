import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Gauge,
  Keyboard,
  MousePointerClick,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { AUTOMATIONS_PATH, TOKEN_USAGE_PATH } from "@/lib/links";

const LINK =
  "font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const EXTRAS: { icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  {
    icon: Keyboard,
    title: "Switch without the mouse",
    body: "⌘1–⌘9 jump to the first nine projects in sidebar order, Ctrl+Tab flips between the projects you used last, and ⌘B hides the sidebar.",
  },
  {
    icon: MousePointerClick,
    title: "A menu on every row",
    body: "Right-click for git (pull, push, commit, create a PR), Duplicate, New Worktree, Open with your editor, or Detach to new window.",
  },
  {
    icon: Activity,
    title: "Activity across projects",
    body: "⌘⇧A lists your Claude Code and Codex agents, running services, and this Mac's automations, with whatever needs you at the top.",
  },
  {
    icon: Gauge,
    title: "Plan usage at the bottom",
    body: (
      <>
        Claude and Codex usage bars show how much of the window is gone, when
        it resets, and a pace marker. More on{" "}
        <Link href={TOKEN_USAGE_PATH} className={LINK}>
          token usage
        </Link>
        .
      </>
    ),
  },
  {
    icon: CalendarClock,
    title: "Automations from the footer",
    body: (
      <>
        Scheduled agent jobs open from the sidebar footer, and new results
        stay unread until you open them. See how to{" "}
        <Link href={AUTOMATIONS_PATH} className={LINK}>
          schedule Claude Code tasks
        </Link>
        .
      </>
    ),
  },
  {
    icon: SquareTerminal,
    title: "Shells without a project",
    body: "The Terminals entry opens quick shells for scripts and system commands, with the same tabs, splits, and agent status.",
  },
];

export default function SidebarExtras() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Around the rows"
          title="More that lives in the sidebar"
          className="mb-12"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {EXTRAS.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
