import {
  Eye,
  GitBranch,
  GitPullRequestArrow,
  Layers,
  PencilLine,
  Terminal,
  Undo2,
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
    title: "Every change, one keystroke away",
    body: (
      <>
        Press <code className="text-xs">⌘⇧R</code> and every uncommitted change
        stacks up in one scrolling view beside a tree of the changed files,
        each marked modified, added, deleted, renamed, or untracked. Unchanged
        lines fold away, and you can switch between split and unified.
      </>
    ),
  },
  {
    icon: Zap,
    title: "Review AI-agent changes on the spot",
    body: "When Claude Code or Codex edits your files, open the diff in the same workspace and see exactly what the agent did before you commit it. The list refreshes on its own as the agent keeps writing.",
  },
  {
    icon: PencilLine,
    title: "Fix it in the diff",
    body: "The right side of every diff is editable; save with ⌘S. If the agent rewrote the file while you were typing, lpm doesn't overwrite it and asks whether to keep yours or theirs.",
  },
  {
    icon: Layers,
    title: "The diff sits beside everything else",
    body: "Your review pane lives next to the failing test, the streaming service logs, and the agent terminal. Spot a regression in the diff and re-run the test in the pane beside it, without leaving the window.",
  },
  {
    icon: GitPullRequestArrow,
    title: "From review to commit in one flow",
    body: "Open Commit, tick what belongs in it, and your AI agent writes the message. Commit it, or Commit and Push it in one go; Create PR drafts the GitHub title and description the same way.",
  },
  {
    icon: Undo2,
    title: "Throw away what you don't want",
    body: "Discard the changes to one file, a whole folder, or everything, with a confirmation first. Handy when an agent wandered into files it had no business touching.",
  },
  {
    icon: GitBranch,
    title: "Per-project, per-branch, always in context",
    body: "Each project keeps its own workspace, so the changes you're reviewing are always for the branch and repo in front of you. Switch projects and come back; your review is where you left it.",
  },
  {
    icon: Terminal,
    title: "Mac desktop app, keyboard-driven, zero Electron",
    body: "lpm ships as a macOS desktop app with native Apple silicon and Intel builds. Its interface uses the system webview instead of bundling Electron or Chromium, and you can move through changed files from the keyboard.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Review where you work"
          title="A code review surface built into your terminal"
          description="What changes when reviewing your own changes never asks you to leave the window."
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
