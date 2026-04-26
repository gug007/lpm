import {
  Activity,
  ListTree,
  Network,
  RadioTower,
  Server,
  Shuffle,
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
    icon: ListTree,
    title: "Pick any host from ~/.ssh/config",
    body: (
      <>
        Open the SSH project picker and a dropdown appears, populated from your{" "}
        <code className="text-xs">~/.ssh/config</code>. Selecting a host
        pre-fills the host alias, user, port, and identity file in one click.{" "}
        <code className="text-xs">Include</code> directives are followed up to
        four levels deep, so split configs at{" "}
        <code className="text-xs">~/.ssh/config.d/work</code> show up too.
        Wildcard and <code className="text-xs">Match</code> blocks are skipped
        because they aren&apos;t pickable hosts.
      </>
    ),
  },
  {
    icon: Network,
    title: "Remote port forwarding with a readiness check",
    body: (
      <>
        Type a remote port, leave the local port blank, hit Enter. lpm spawns
        the forward and polls{" "}
        <code className="text-xs">localhost:&lt;port&gt;</code> until something
        actually accepts a TCP connect — only then does the success toast
        appear. The toast and the working tunnel are in sync, so you click the
        link and it works the first time. No more guessing whether{" "}
        <code className="text-xs">ssh -L</code> actually came up.
      </>
    ),
  },
  {
    icon: Server,
    title: "Remote services in panes, beside your local ones",
    body: "Services declared in the project's YAML run on the remote host but stream into lpm panes the same way local services do. Switch between staging-api (remote) and frontend (local) like they're the same shape — because in lpm they are. One native Mac window holds the whole stack regardless of which side of the SSH boundary each piece lives on.",
  },
  {
    icon: Shuffle,
    title: "Action mode: run remote, or sync and run local",
    body: (
      <>
        Each action declares <code className="text-xs">mode: remote</code> (run
        the command on the host over ssh) or{" "}
        <code className="text-xs">mode: sync</code> (rsync the remote source
        tree into a local mirror, run a local tool against it, push changes
        back). Local formatters, refactors, and AI coding sessions get to act
        on remote source without you shuttling files. The ssh action mode flips
        per-action, so each step picks the right side of the wire.
      </>
    ),
  },
  {
    icon: RadioTower,
    title: "Connection multiplexing, ready when the tunnel is",
    body: (
      <>
        Every ssh invocation shares an OpenSSH{" "}
        <code className="text-xs">ControlMaster</code> channel — the first auth
        pays the cost (including any 2FA on a jump host) and every subsequent
        service start, action run, and terminal open reuses the channel.
        Forwards report success only after the local listener actually accepts
        a connection. Server keepalive surfaces a dropped link promptly instead
        of leaving you staring at a dead pane.
      </>
    ),
  },
  {
    icon: Activity,
    title: "Per-project remote profile, isolated lifecycle",
    body: (
      <>
        Each project carries its own <code className="text-xs">ssh:</code>{" "}
        block — host, user, port, key, remote directory — alongside its
        services and actions. Forwards, port pollers, and rsync mirrors are
        scoped to that project. Stop the project and every forward dies; quit
        the app and nothing leaks. <code className="text-xs">prod</code>,{" "}
        <code className="text-xs">staging</code>, and your local copy are three
        peer projects, one click apart.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What a remote-aware terminal looks like"
          title="An SSH terminal that imports your config, forwards your ports, and runs your remote services next to local ones"
          description="Six capabilities that change how remote Mac development feels when the terminal understands SSH instead of just hosting it."
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
