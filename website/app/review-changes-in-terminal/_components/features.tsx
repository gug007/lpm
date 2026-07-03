import {
  Eye,
  GitBranch,
  GitPullRequestArrow,
  Layers,
  Terminal,
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
    icon: Eye,
    title: "File-by-file diff, one keystroke away",
    body: (
      <>
        Open a review pane with{" "}
        <code className="text-xs">⌘⇧R</code> and every changed file is listed
        with an <span className="font-mono">M</span> /{" "}
        <span className="font-mono">A</span> / <span className="font-mono">D</span>{" "}
        status. Click a file to read its diff — added lines in green, removed in
        red, right there in the window you already work in.
      </>
    ),
  },
  {
    icon: Zap,
    title: "Review AI-agent changes on the spot",
    body: "When Claude Code or Codex edits your files, open the diff in the same workspace and see exactly what the agent did before you accept it. No blind approvals, no context-switch to a separate tool.",
  },
  {
    icon: Layers,
    title: "The diff sits beside everything else",
    body: "Your review pane lives next to the failing test, the streaming service logs, and the agent terminal. Spot a regression in the diff and re-run the test in the pane beside it — without ever leaving the window.",
  },
  {
    icon: GitBranch,
    title: "Per-project, per-branch — always in context",
    body: "Each project keeps its own workspace, so the changes you're reviewing are always for the branch and repo in front of you. Switch projects and come back — your review is exactly where you left it.",
  },
  {
    icon: GitPullRequestArrow,
    title: "From review to commit in one flow",
    body: "Read the diff, catch the stray console.log, fix it in the editor pane, and commit — a single, uninterrupted loop. The review is the last gate before your code ships, and it's built into the terminal.",
  },
  {
    icon: Terminal,
    title: "Native, keyboard-driven, zero Electron",
    body: "It's a real macOS app on Apple Silicon, not a web view. Navigate files with the arrow keys, scroll long diffs smoothly, and keep your hands where they already are — on the keyboard.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Review where you work"
          title="A code review surface built into your terminal"
          description="Six things that change how reviewing your own changes feels when the diff never asks you to leave."
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
