import {
  Activity,
  Bot,
  FolderTree,
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
        Type a remote port, leave the local port blank, hit Enter. lpm opens
        the forward and waits until the local address actually answers before
        the success toast appears, so the link in the toast works the first
        time. No more guessing whether{" "}
        <code className="text-xs">ssh -L</code> actually came up.
      </>
    ),
  },
  {
    icon: Server,
    title: "Remote services in panes, like local ones",
    body: "Services declared in an SSH project run on the remote host and stream into lpm panes the same way local services do. The remote project sits in the same sidebar as your local ones, one click away, with its running state kept while you work elsewhere.",
  },
  {
    icon: Shuffle,
    title: "Actions run on the remote by default",
    body: "On an SSH project, deploys, migrations, and remote builds run on the host with one click. One setting in the project config lets an action run on your Mac instead, against a synced copy of the remote folder that pushes changes back when it finishes.",
  },
  {
    icon: RadioTower,
    title: "One connection, shared and kept alive",
    body: "Services, actions, and terminals share one SSH connection per host, so a jump host's 2FA prompt comes once. Keepalives catch a dropped link, and SSH terminals reconnect on their own with a fresh shell.",
  },
  {
    icon: Bot,
    title: "Claude Code and Codex report home",
    body: "Open a terminal on the remote box and lpm sets up its agent status and skills there. Claude Code and Codex running on the server light up your Mac sidebar and send the same alerts as local agents.",
  },
  {
    icon: FolderTree,
    title: "Browse the remote project",
    body: "The Files tab lists the remote project's tree and opens files for reading, and git status, branches, commits, and pull requests run on the host over the same connection. Open with sends the folder to VS Code or Cursor over Remote-SSH.",
  },
  {
    icon: Activity,
    title: "Per-project remote profile, isolated lifecycle",
    body: "Each project remembers its own remote: host, user, port, key, and working directory, alongside its services and actions. Stop the project and every forward closes; quit the app and nothing leaks. Prod, staging, and your local copy are three peer projects, one click apart.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What a remote-aware terminal looks like"
          title="An SSH terminal that knows your config and forwards your ports"
          description="What changes when the terminal understands SSH instead of just hosting it."
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
