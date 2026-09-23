import Link from "next/link";
import {
  Activity,
  Bot,
  FolderKanban,
  GitCompare,
  LayoutGrid,
  MessageSquareText,
  MousePointerClick,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { PROJECT_SIDEBAR_PATH, REVIEW_CHANGES_PATH } from "@/lib/links";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const LINK =
  "font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const FEATURES: Feature[] = [
  {
    icon: Bot,
    title: "Claude and Codex, one click away",
    body: (
      <>
        A fresh install puts Claude and Codex buttons on every project. Each
        opens the agent in a new tab next to your services, and a button can
        carry a starting prompt.
      </>
    ),
  },
  {
    icon: FolderKanban,
    title: "A sidebar that lists every agent",
    body: (
      <>
        Each project lists its Claude Code and Codex sessions underneath: what
        each one is doing and for how long. Click a row to jump to its tab.
        More on the{" "}
        <Link href={PROJECT_SIDEBAR_PATH} className={LINK}>
          project sidebar
        </Link>
        .
      </>
    ),
  },
  {
    icon: MessageSquareText,
    title: "A prompt box that knows your project",
    body: (
      <>
        Press ⌘I for a composer under any terminal. Type @ to pull in a file, a
        branch, the changed files, or a running service&apos;s latest logs, and
        paste screenshots straight in.
      </>
    ),
  },
  {
    icon: LayoutGrid,
    title: "Every service, side by side",
    body: (
      <>
        Each dev server streams into its own tab, and the All tab lays them out
        in columns. When the API throws, you see it while the agent is still
        typing.
      </>
    ),
  },
  {
    icon: Activity,
    title: "Everything running, on one screen",
    body: (
      <>
        ⌘⇧A opens Activity: every Claude Code and Codex session, running
        service, and automation across your projects, with whatever needs you
        at the top. Move through it with j and k.
      </>
    ),
  },
  {
    icon: GitCompare,
    title: "Review before you commit",
    body: (
      <>
        ⌘⇧R shows everything the agent changed as one stack of diffs, and the
        Commit dialog drafts the message with AI. See how to{" "}
        <Link href={REVIEW_CHANGES_PATH} className={LINK}>
          review changes in the terminal
        </Link>
        .
      </>
    ),
  },
  {
    icon: MousePointerClick,
    title: "One-click actions",
    body: (
      <>
        Turn tests, lints, migrations, and deploys into buttons in the project
        header. Run them while the agent keeps working next door.
      </>
    ),
  },
  {
    icon: SlidersHorizontal,
    title: "Service profiles",
    body: (
      <>
        Save groups like &ldquo;API only&rdquo; in the Start menu and run just
        the services the agent touches, or the full stack when you need it.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Inside the app"
          title="A native workspace for the agents doing your work"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
