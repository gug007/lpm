import { Battery, MonitorCog, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Battery,
    title: "Electron terminals eat your battery",
    body: "Hyper and Tabby ship a full Chromium runtime in every window. On an M1 MacBook Air that means hot laps, loud fans, and a battery that barely survives an afternoon of npm run dev.",
  },
  {
    icon: MonitorCog,
    title: "Terminal.app feels frozen in 2008",
    body: "Apple's built-in Terminal still looks and behaves like a Snow Leopard relic. No split panes worth using, no project awareness, no live dashboard for the five services your stack actually needs.",
  },
  {
    icon: PanelsTopLeft,
    title: "iTerm2 is tabs, not a workspace",
    body: "iTerm2 is a great tab manager, but it still leaves you wiring up the stack by hand every morning. Open tab, cd, run server. Open tab, cd, run worker. Repeat. Forever.",
  },
];

export default function WhyMac() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Built for macOS"
          title="Why the best terminal for Mac has to be native"
          description="Electron terminals like Hyper and Tabby turn your MacBook into a fan-spinning Chromium tab. Your Mac deserves a real desktop app that feels like the OS it runs on."
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
