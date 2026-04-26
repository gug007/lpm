import { GitBranch, LayoutPanelLeft, MonitorX, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LayoutPanelLeft,
    title: "You context-switch between a GUI git client and a terminal constantly",
    body: "GitKraken shows you the branch graph. SourceTree shows you the diff. But neither one runs your dev server, so you still flip to a terminal for every npm run dev or rails s. You end up with three windows open to do the work of one.",
  },
  {
    icon: GitBranch,
    title: "Branch switching mid-session kills your running services",
    body: "You're debugging on feature/auth-refactor with three services streaming logs. A colleague asks for a quick review on main. You switch branches and your running servers either break or need a full restart. By the time you're back on your original branch, you've lost the thread entirely.",
  },
  {
    icon: MonitorX,
    title: "CI logs are somewhere else entirely",
    body: "Your pull request CI is running on GitHub Actions. Your local terminal is somewhere else. Watching a CI job means opening a browser tab, refreshing manually, or setting up a separate CLI tool — none of which is where your code is.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The git context tax"
          title="Your git workflow lives in a different window from everything else"
          description="Every branch switch, rebase, and PR review means leaving your running services to find the right terminal tab. That gap costs more than you think."
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
