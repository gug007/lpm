import { BellOff, DoorOpen, Timer, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: DoorOpen,
    title: "Agents stall the second you step away from your desk",
    body: "You kick off a long refactor with Claude Code and go make coffee. Two minutes in, the agent hits a question and waits. It sits idle until you're back at the keyboard — and you have no idea it stopped.",
  },
  {
    icon: BellOff,
    title: "You can't tell if a build is done from across the house",
    body: "Tests are running, a deploy is churning, an agent is thinking. To know whether any of it finished, you have to walk back to your Mac, wake it, and read the terminal. There's no way to glance and know.",
  },
  {
    icon: Timer,
    title: "A one-line answer means a full trip back to your desk",
    body: "The agent just needs a yes, a file name, or a quick correction. But typing that one line means being physically in front of your Mac. The smallest input becomes the biggest interruption.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The away-from-desk tax"
          title="Your agents keep working — but only while you're sitting in front of them"
          description="AI coding agents run for minutes at a time, then wait for you. If you're not at your Mac, that wait is dead time you never even see."
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
