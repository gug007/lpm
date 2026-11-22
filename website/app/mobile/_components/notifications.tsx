import { BellRing, Lock, Reply, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { STATUS_AGENT_CHOICES } from "@/lib/app-facts";
import NotificationAnswers from "./notification-answers";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BellRing,
    title: "Know the second an agent needs you",
    body: `When ${STATUS_AGENT_CHOICES} stops to ask a question, finishes a task, or hits an error, a notification lands on your phone, even with the app closed. Automations can alert you too when they start, finish, or fail. Turn each kind on or off.`,
  },
  {
    icon: Lock,
    title: "End-to-end encrypted, always",
    body: "Every alert is sealed with a per-device AES-256 key that only your phone and your Mac share. The delivery relay passes along an opaque blob it can't read, and your phone decrypts it on arrival.",
  },
  {
    icon: Reply,
    title: "Answer from the notification",
    body: "Allow or Deny a Claude Code or Codex permission prompt, or Reply when an agent finishes, without opening the app. Tap the alert to open that terminal instead. Handle it on your Mac and the notification withdraws itself.",
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
        <NotificationAnswers />
      </div>
    </section>
  );
}
