import {
  Fingerprint,
  Keyboard,
  MonitorSmartphone,
  MousePointerClick,
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
    icon: MonitorSmartphone,
    title: "A live mirror, not a screenshot",
    body: "Every terminal on your Mac streams to your phone character by character, with full scrollback. It's the same session — what you see on the phone is exactly what's on the Mac, updating as it happens. Leave the app and come back and it re-seeds the live view instantly.",
  },
  {
    icon: Fingerprint,
    title: "Take control with one tap",
    body: "A terminal is live in one place at a time. When it's active on your Mac, your phone shows a Take control button — tap it and the session hands off to your hand, keystrokes and all. Tap away on the Mac and it hands right back.",
  },
  {
    icon: Keyboard,
    title: "The keys a terminal actually needs",
    body: (
      <>
        A special-keys row sits above the keyboard: <code className="text-xs">esc</code>,{" "}
        <code className="text-xs">tab</code>, <code className="text-xs">ctrl+C</code>,{" "}
        arrows, enter, and paste. Answer a prompt, interrupt a run, or drive a
        full-screen TUI without hunting for keys your phone doesn&rsquo;t have.
      </>
    ),
  },
  {
    icon: MousePointerClick,
    title: "Scroll it like a native app",
    body: "Flick to scroll back through output with your thumb — even inside full-screen terminal apps that normally trap the mouse. The scrollback you'd reach for on the Mac is right there under your finger.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The live terminal"
          title="Your Mac terminals, live in your pocket"
          description="Not a status page and not a remote desktop — the real session, streamed to your phone and ready for your thumbs."
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
