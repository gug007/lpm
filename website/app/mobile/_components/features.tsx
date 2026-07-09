import {
  BellRing,
  Image,
  MonitorSmartphone,
  Play,
  SlidersHorizontal,
  TerminalSquare,
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
    body: "Every terminal on your Mac streams to your phone character by character, with full scrollback. It's the same session — what you see on the phone is exactly what's on the Mac, updating as it happens.",
  },
  {
    icon: TerminalSquare,
    title: "Type straight into a running agent",
    body: (
      <>
        Tap into any terminal and start typing. Your keystrokes go to the real
        session on your Mac, so you can answer a prompt, correct an agent, or run{" "}
        <code className="text-xs">git status</code> — all from the couch.
      </>
    ),
  },
  {
    icon: BellRing,
    title: "Know the moment an agent needs you",
    body: "When Claude Code or Codex finishes or stops to ask a question, the project's status flips to Waiting on your phone. The idle time between a stall and your reply disappears.",
  },
  {
    icon: Play,
    title: "Start, stop, and switch projects",
    body: "Browse every project from your phone, start or stop the whole stack, and toggle individual services on and off. Spin up the API before you're back at your desk so it's ready when you sit down.",
  },
  {
    icon: SlidersHorizontal,
    title: "Run actions and open terminals remotely",
    body: "Trigger a saved action — a test run, a linter, a deploy script — or open a fresh terminal in any project. It runs on your Mac in the normal flow and shows up the next time you look.",
  },
  {
    icon: Image,
    title: "Send a screenshot to your agent",
    body: "Snap or pick an image on your phone and drop it into the composer. lpm moves it onto your Mac and pastes the path so the agent can read it — handy for a bug screenshot or a design reference on the go.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What you can do from your phone"
          title="The detached-window experience, in your pocket"
          description="Six things the lpm iOS app lets you do without walking back to your Mac."
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
