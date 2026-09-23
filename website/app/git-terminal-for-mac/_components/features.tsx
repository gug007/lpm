import {
  Eye,
  FolderKanban,
  GitBranch,
  GitPullRequestArrow,
  Layers,
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
    icon: GitBranch,
    title: "Branch in one pane, serve in another",
    body: (
      <>
        Open a shell pane for your git workflow right next to your running
        service panes. Run{" "}
        <code className="text-xs">git rebase -i</code>, resolve conflicts, and
        push — while your dev server never stops streaming. Everything lives in
        the same native Mac window.
      </>
    ),
  },
  {
    icon: FolderKanban,
    title: "Per-project git context, always intact",
    body: "Every project has its own persistent workspace. Switch to another repo mid-session and your first project keeps its branch, its running services, and its terminal history. Switch back and nothing has changed.",
  },
  {
    icon: GitPullRequestArrow,
    title: "From commit to pull request in one window",
    body: "The Git bar under your terminals shows the branch, ahead and behind counts, and how many files changed. Commit picks the files and drafts the message with AI; Create PR writes the title and description and opens it on GitHub.",
  },
  {
    icon: Layers,
    title: "Services keep running through a checkout",
    body: "lpm never restarts your services behind your back when you switch branches. Your dev server keeps streaming and hot-reloads the new branch. To keep one branch running while you work on another, open it as a worktree.",
  },
  {
    icon: Zap,
    title: "A fresh stack after a big rebase",
    body: "After a rebase that touches dependencies or migrations, Stop and Start bring the whole defined stack back in two clicks, in dependency order. No chain of dev-server commands typed from memory.",
  },
  {
    icon: Eye,
    title: "Watch every service log while you git",
    body: (
      <>
        While you run{" "}
        <code className="text-xs">git bisect</code> or step through a conflict
        resolution, the service log panes stay live beside your shell. You can
        see if a change you just pulled broke the API before you even finish the
        rebase.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Git in your terminal, not a separate app"
          title="A terminal that keeps git and your dev servers in the same window"
          description="Your own shell for the git you type, and your dev servers streaming beside it."
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
