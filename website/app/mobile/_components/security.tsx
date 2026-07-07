import { KeyRound, Laptop, ShieldCheck, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: KeyRound,
    title: "Per-device tokens, stored on the phone",
    body: "Pairing issues a unique token that lives in your iPhone's Keychain. Your Mac only ever stores its hash — the raw token never leaves the device. Revoke a phone in Settings and its access is gone instantly, live connection dropped.",
  },
  {
    icon: Laptop,
    title: "Nothing runs in the cloud",
    body: "There's no lpm server in the middle. Your phone connects directly to your Mac on your own network. No project data, no terminal output, and no keystrokes ever pass through a third party.",
  },
  {
    icon: ShieldCheck,
    title: "You choose the reach",
    body: "By default the server only listens on your Mac. Opt in to your local network when you want the phone on the same Wi-Fi, or use a Tailscale tailnet for encrypted access from anywhere. You decide how far it goes.",
  },
];

export default function Security() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Yours, and only yours"
          title="Remote access to your dev machine, on your terms"
          description="The phone controls a real terminal on your Mac — so the connection is built to be private, direct, and revocable."
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
