import Link from "next/link";
import {
  Bot,
  Cpu,
  FileCode,
  FolderKanban,
  GitBranch,
  Globe,
  LayoutGrid,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { GIT_TERMINAL_MAC_PATH, PARALLEL_PATH } from "@/lib/links";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const LINK =
  "font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const FEATURES: Feature[] = [
  {
    icon: FolderKanban,
    title: "Per-project workspaces, not tabs",
    body: "Each project lives in its own persistent workspace with its own services, logs, and terminal sessions. Switch repos in the sidebar without touching what's running anywhere else.",
  },
  {
    icon: LayoutGrid,
    title: "Per-service log panes",
    body: "Every service gets its own scrollable log pane. Watch your API, your worker, and your Next.js dev server at once, each one labeled and isolated, so you can see at a glance which service threw the error.",
  },
  {
    icon: ScanSearch,
    title: "Services detected from your repo",
    body: "Add a folder and lpm reads its manifests, from package.json and Procfiles to Compose files, Rails, Django, Go, and Cargo. Each app in a monorepo becomes its own service, and one click starts them all. Refine the setup with AI in the config editor.",
  },
  {
    icon: GitBranch,
    title: "Git and services coexist in the same window",
    body: (
      <>
        Run <code className="text-xs">git rebase</code>
        {", "}
        <code className="text-xs">git bisect</code>
        {", "}or a migration in a shell pane while your dev servers keep
        streaming next to it. More on lpm as a{" "}
        <Link href={GIT_TERMINAL_MAC_PATH} className={LINK}>
          git terminal for Mac
        </Link>
        .
      </>
    ),
  },
  {
    icon: FileCode,
    title: "Fix a config file without leaving the stack",
    body: "⌘⇧E opens the Files tab in the same pane as your logs. Jump to the Compose file or a migration with ⌘P, fix it, and save with ⌘S, then start the service again from the Start menu.",
  },
  {
    icon: Globe,
    title: "Preview the dev server in a pane",
    body: "Open a browser tab next to the service that serves the page and watch both at once. For the full browser, right-click a service tab and open its port in your default one.",
  },
  {
    icon: Bot,
    title: "A copy of the project for each AI agent",
    body: (
      <>
        Give each agent its own copy with Duplicate or New Worktree, so agents
        never edit the same files, and lpm warns you when two copies want the
        same port. See how to{" "}
        <Link href={PARALLEL_PATH} className={LINK}>
          run Claude Code in parallel
        </Link>
        .
      </>
    ),
  },
  {
    icon: Cpu,
    title: "Native Apple Silicon, zero Electron",
    body: "A proper macOS app with no bundled Chromium runtime. Your M-series chip runs your stack, not a web browser dressed up as a terminal.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Built for the way developers actually work"
          title="A terminal workspace that understands your stack"
          description="What changes when the terminal knows which services a project runs, not just which commands you type."
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
