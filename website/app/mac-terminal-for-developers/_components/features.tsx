import {
  Bot,
  Cpu,
  FolderKanban,
  GitBranch,
  LayoutGrid,
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
    icon: FolderKanban,
    title: "Per-project workspaces, not tabs",
    body: "Each project lives in its own persistent workspace with its own services, logs, and terminal sessions. Switch repos in the sidebar without touching what's running anywhere else.",
  },
  {
    icon: LayoutGrid,
    title: "Per-service log panes",
    body: "Every service gets its own scrollable log pane. Watch your API, your worker, and your Next.js dev server simultaneously — each one labeled, each one isolated, so you know in two seconds which service threw the error.",
  },
  {
    icon: Zap,
    title: "One-click full-stack start",
    body: "Define your services once. After that, one click starts your entire stack in the right order. lpm auto-detects Rails, Next.js, Go, Django, Flask, and Docker Compose configurations the first time you open a project folder.",
  },
  {
    icon: GitBranch,
    title: "Git and services coexist in the same window",
    body: (
      <>
        Run{" "}
        <code className="text-xs">git rebase</code>,{" "}
        <code className="text-xs">git bisect</code>, or a full migration in a
        shell pane while your dev servers keep streaming in adjacent panes — all
        inside one native Mac window, no window-manager juggling required.
      </>
    ),
  },
  {
    icon: Bot,
    title: "Run multiple AI agents without conflicts",
    body: "Assign each AI coding agent its own workspace so agents working on the same codebase don't clobber each other's running servers or terminal state. Purpose-built for multi-agent development flows.",
  },
  {
    icon: Cpu,
    title: "Native Apple Silicon, zero Electron",
    body: "A proper macOS app — no Chromium runtime, no Node.js renderer process. Your M-series chip runs your stack, not a web browser dressed up as a terminal.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Built for the way developers actually work"
          title="A terminal workspace that understands your stack"
          description="Six capabilities that change how you develop on a Mac — not just how you type commands."
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
