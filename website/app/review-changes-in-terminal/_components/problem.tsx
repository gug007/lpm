import { GitBranch, LayoutPanelLeft, MonitorX, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MonitorX,
    title: "You leave your terminal just to read a diff",
    body: "Your code and your running services are in the terminal. But to actually see what changed, you open a browser tab, a desktop git client, or your editor's source-control panel. The review happens everywhere except where the work does.",
  },
  {
    icon: LayoutPanelLeft,
    title: "AI agents write more than you can read",
    body: "Claude Code or Codex just touched twelve files. Approving blindly is how bugs ship; scrolling a cramped terminal diff is painful. You need a real review surface — right where the agent is working, not in a separate app.",
  },
  {
    icon: GitBranch,
    title: "Losing the diff means losing the context",
    body: "Switch to a diff tool and you lose sight of the failing test, the streaming logs, the branch you're on. By the time you're back, you've forgotten which change you were checking and why it mattered.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The review context tax"
          title="Reviewing your changes shouldn't mean leaving your workspace"
          description="Every commit is a decision. Making it well means seeing the diff next to the tests, the logs, and the agent that wrote it — not in a window three apps away."
          className="mb-12"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARDS.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title} size="lg">
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
