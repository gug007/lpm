import { BellRing, Lock, Navigation, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BellRing,
    title: "Know the second an agent needs you",
    body: "When Claude Code or Codex stops to ask a question, finishes a task, or hits an error, a notification lands on your phone — even with the app closed. Turn each kind on or off: waiting, finished, errored. The idle time between a stall and your reply disappears.",
  },
  {
    icon: Lock,
    title: "End-to-end encrypted, always",
    body: "Every alert is sealed with an AES-256 key that only your iPhone holds. It travels to your phone as an opaque blob that the delivery relay can't read — the contents are decrypted on your device and nowhere else.",
  },
  {
    icon: Navigation,
    title: "Tap to jump straight in",
    body: "Tapping a notification deep-links right to the project that needs you, ready to answer. Handle it on your Mac instead and the notification quietly withdraws itself, so you're never chasing an alert that's already done.",
  },
];

export default function Notifications() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Encrypted alerts"
          title="Never miss a waiting agent again"
          description="Close the app and go live your life. The moment an agent is waiting, finished, or stuck, your phone tells you — privately."
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
