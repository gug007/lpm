import {
  Cpu,
  FolderKanban,
  GitBranch,
  LayoutGrid,
  Moon,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { PROJECT_SIDEBAR_PATH } from "@/lib/links";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: "Native Apple silicon and Intel builds",
    body: (
      <>
        Ships separate native builds for Apple silicon and Intel Macs. No
        Rosetta on Apple silicon, no Electron, and no bundled Chromium runtime
        — the app uses the webview already provided by macOS.
      </>
    ),
  },
  {
    icon: LayoutGrid,
    title: "Every service in one window",
    body: (
      <>
        Watch your API, worker, database, and Next.js frontend stream live
        logs side by side in one native window. No more ten iTerm2 tabs
        guessing which one crashed.
      </>
    ),
  },
  {
    icon: FolderKanban,
    title: "Visual project switcher",
    body: (
      <>
        Every project sits in a{" "}
        <Link
          href={PROJECT_SIDEBAR_PATH}
          className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
        >
          sidebar with live state
        </Link>
        . Click to jump to a running stack, or start a fresh one. No more{" "}
        <code className="text-xs">cd ~/code/long/path</code>, no more
        &ldquo;which Terminal.app window was that?&rdquo;.
      </>
    ),
  },
  {
    icon: Zap,
    title: "One-command full-stack start",
    body: (
      <>
        Define your services once, then start the entire stack with a single
        click. lpm can generate the config for you with AI the first time you
        open a project — Rails, Next.js, Go, Django, Flask, or Docker Compose.
      </>
    ),
  },
  {
    icon: GitBranch,
    title: "Great git terminal on macOS",
    body: (
      <>
        Pair lpm with your favorite shell — zsh, bash, or fish — and run every
        git workflow inside a pane that also shows your dev servers. Commit,
        push, and watch CI logs without leaving the window.
      </>
    ),
  },
  {
    icon: Moon,
    title: "Dark mode, Finder-native feel",
    body: (
      <>
        Respects the system theme, matches macOS window chrome, and opens
        folders straight in Finder. Feels like it was built on the Mac,
        because it was.
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
          title="A Mac-native terminal workspace, not another tab strip"
          description="Six reasons developers choose lpm as a terminal workspace for Mac."
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
