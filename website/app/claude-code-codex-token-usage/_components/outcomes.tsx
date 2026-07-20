import {
  ChartNoAxesCombined,
  FolderSearch2,
  GitCompareArrows,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const OUTCOMES: {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: ChartNoAxesCombined,
    title: "Understand where the tokens went",
    body: "Separate fresh input, cached input, output, and reasoning tokens. See the peak day and an approximate model-aware cost beside the total.",
  },
  {
    icon: GitCompareArrows,
    title: "Compare Claude Code and Codex",
    body: "Read provider share at a glance, then switch the daily chart between token volume and percentage share to see how your workflow changes.",
  },
  {
    icon: FolderSearch2,
    title: "Trace usage back to the work",
    body: "Rank projects by tokens or sessions and inspect recent runs with their provider, model, duration, recency, and token composition.",
  },
];

export default function Outcomes() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Useful answers, not another counter"
          title="Know what your agents used—and why"
          description="The total matters. The provider, project, model, cache share, and session behind it matter more."
          className="mb-12"
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {OUTCOMES.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title} size="lg">
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
