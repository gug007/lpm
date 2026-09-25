import {
  FolderSync,
  KeyRound,
  Layers,
  ShieldCheck,
  Users,
  Wand2,
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
    icon: Users,
    title: "Pin an account to a project",
    body: "Add your accounts once in Settings, then pick one from the project's menu in the sidebar, where each account shows its 5-hour and weekly usage. From then on every terminal you open in the project launches Claude Code on that account. Projects without a pin keep your main login, so nothing changes until you ask it to.",
  },
  {
    icon: Layers,
    title: "Accounts run in parallel, not in turns",
    body: "This is a pin, not a switch. The work project runs the company seat while the side project runs your personal subscription, at the same time. There is no global “active account” to flip and no restart ripple across running sessions.",
  },
  {
    icon: KeyRound,
    title: "Sign in once per account",
    body: "Click Sign in next to the account in Settings and lpm opens Claude's own sign-in for it. Settings then shows the account's email and which projects use it, and every terminal on a project pinned to it is already signed in.",
  },
  {
    icon: ShieldCheck,
    title: "Your tokens stay where Claude put them",
    body: "lpm never reads, copies, or exports credentials. Each account gets its own Claude Code home, and Claude Code itself keeps each login in the macOS Keychain — exactly as it does for a single account. No token files to back up, restore, or leak.",
  },
  {
    icon: FolderSync,
    title: "Your setup follows every account",
    body: "Your settings, CLAUDE.md memory, skills, subagents, slash commands, and plugins are shared across accounts. User-level MCP servers and past sessions stay with each account. lpm's agent status keeps working too.",
  },
  {
    icon: Wand2,
    title: "Built-in AI features respect the pin",
    body: "Commit messages, PR titles and descriptions, branch names, merge-conflict resolution, and composer rewrites all run on the project's pinned account, not just the terminals.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/50 dark:bg-white/[0.02]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it works"
          title="Per-project Claude accounts, built into your terminal"
          description="Not a credential swapper — a project workspace that knows which identity each project uses."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
