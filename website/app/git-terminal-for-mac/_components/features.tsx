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
    title: "One window from commit to merged PR",
    body: "Write code, stage hunks, push the branch, and watch CI output — all in panes inside a single lpm window. You no longer need a GUI git client for the overview and a terminal for the commands. The terminal is the overview.",
  },
  {
    icon: Layers,
    title: "Keep services running across branch switches",
    body: "lpm project workspaces are branch-agnostic by default. Your dev server does not care that you checked out a new branch — it keeps running unless you explicitly restart it. Reviewable changes, uninterrupted services.",
  },
  {
    icon: Zap,
    title: "One-click stack restart after a big rebase",
    body: (
      <>
        After a rebase that touches dependencies or migrations, one click stops
        and restarts your entire defined stack in the correct order. No manual{" "}
        <code className="text-xs">npm install && rails db:migrate && npm run dev</code>{" "}
        typed from memory.
      </>
    ),
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
          description="Six capabilities that change how git feels when your terminal understands your whole workflow."
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
