import { Eye, Layers, Network, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Network,
    title: "Port conflicts everywhere",
    body: "Two agents spin up the same dev server and race for port 3000. One wins, one crashes, and you spend more time restarting than coding.",
  },
  {
    icon: Eye,
    title: "No idea who is doing what",
    body: "Five terminal tabs, five agents, and no clear view of which one is running tests, which is waiting, and which just errored out.",
  },
  {
    icon: Layers,
    title: "Context vanishes on every switch",
    body: "Jump to another project and your running services, logs, and agent sessions are gone. Coming back means rebuilding the whole stack from memory.",
  },
];

export default function WhyParallel() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The problem"
          title="Running agents in parallel breaks a regular terminal"
          description="One AI coding agent is easy. Two or three working side by side on real projects is where the wheels come off — you need a workspace built for it."
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
