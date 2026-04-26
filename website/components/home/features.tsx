import {
  Blocks,
  CopyPlus,
  GitPullRequestArrow,
  Layers,
  Monitor,
  ScanSearch,
  SquareTerminal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: SquareTerminal,
    title: "Live terminal output",
    body: (
      <>
        Watch every service stream in real time. Switch between service tabs or
        tile them side by side — all from a native window.
      </>
    ),
  },
  {
    icon: CopyPlus,
    title: "Parallel agents, same codebase",
    body: (
      <>
        Duplicate any project to run Claude, Codex, or any agent in parallel —
        each on its own checkout, with its own services and terminals. No
        branch conflicts, no context bleed.
      </>
    ),
  },
  {
    icon: GitPullRequestArrow,
    title: "Commits and PRs, built in",
    body: (
      <>
        Stage changes, generate commit messages, and open pull requests right
        from the app. Pair it with Claude or Codex to ship without ceremony.
      </>
    ),
  },
  {
    icon: ScanSearch,
    title: "Auto-detect frameworks",
    body: (
      <>
        Automatically detects Rails, Next.js, Go, Django, Flask, and Docker
        Compose projects.
      </>
    ),
  },
  {
    icon: Zap,
    title: "Instant project switching",
    body: (
      <>
        Stop one project and start another in a single command. No manual
        cleanup needed.
      </>
    ),
  },
  {
    icon: Layers,
    title: "Service profiles",
    body: (
      <>
        Run subsets of your services. Start just the API, or spin up the full
        stack.
      </>
    ),
  },
  {
    icon: Monitor,
    title: "Native macOS app",
    body: (
      <>
        A desktop app with live terminal output, built-in config editor, and
        dark mode.
      </>
    ),
  },
  {
    icon: Blocks,
    title: "Works with any stack",
    body: (
      <>
        If it runs in a terminal, lpm can manage it. No Docker or containers
        required.
      </>
    ),
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What you get"
          title="Built for real dev workflows"
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
