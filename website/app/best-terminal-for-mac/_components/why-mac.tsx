import { Battery, MonitorCog, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Battery,
    title: "No bundled Electron runtime",
    body: "Hyper and Tabby package Electron with their apps. lpm uses the webview already provided by macOS, so its download does not include a separate Chromium runtime.",
  },
  {
    icon: MonitorCog,
    title: "Terminal.app is general-purpose",
    body: "Apple's built-in Terminal gives you a capable shell window. lpm adds the project sidebar, service controls, and live dashboard that a multi-service development stack needs.",
  },
  {
    icon: PanelsTopLeft,
    title: "iTerm2 manages sessions, not projects",
    body: "iTerm2 offers tabs, profiles, and split panes. lpm adds project-aware service definitions, one-click stack controls, and live state for every repo in a visual sidebar.",
  },
];

export default function WhyMac() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Built for macOS"
          title="Why a Mac-focused terminal workspace feels different"
          description="lpm uses the macOS system webview instead of packaging an Electron runtime, with separate native builds for Apple silicon and Intel Macs."
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
