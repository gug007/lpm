import { KeyRound, Plug, Shuffle, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

type Card = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const CARDS: Card[] = [
  {
    icon: Shuffle,
    title: "You context-switch between local panes and SSH sessions all day",
    body: (
      <>
        Your local API streams logs in one window. A second window holds{" "}
        <code className="text-xs">ssh user@build-server</code> for the remote
        service. A third tab is running an{" "}
        <code className="text-xs">ssh -L</code> tunnel so the browser can reach
        it. Three windows to debug one feature, and every time you tab between
        them you lose your place.
      </>
    ),
  },
  {
    icon: Plug,
    title: "Port forwarding gymnastics break every time the remote restarts",
    body: (
      <>
        You hand-type{" "}
        <code className="text-xs">
          ssh -L 3000:localhost:3000 user@build-server
        </code>
        , the remote dev server restarts, the listener dies, and you re-type
        the command from shell history. Sometimes you forget which tab the
        tunnel was in and <code className="text-xs">lsof</code> the orphan ssh
        process out by hand. The work was supposed to be the feature, not the
        tunnel.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: "Re-typing the host, user, port, and key your ~/.ssh/config already knows",
    body: (
      <>
        Your <code className="text-xs">~/.ssh/config</code> already has{" "}
        <code className="text-xs">Host build</code>,{" "}
        <code className="text-xs">ProxyJump bastion</code>, the right port, and
        the right identity file. Too many workflows still make you re-enter or
        copy that data into a separate vault, a saved profile, or a different
        connection string. The config is already there; the terminal should use
        it.
      </>
    ),
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The remote-dev context tax"
          title="Your remote dev box lives in a different window from your local stack"
          description="Every modern Mac developer works partly remote — a staging server, a Linux build box, a cloud workstation, a bastion-fronted EC2. That split between “local terminal” and “ssh session” shows up as friction every hour."
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
