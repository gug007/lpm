import {
  ArrowLeftRight,
  FolderSync,
  KeyRound,
  Layers,
  ListOrdered,
  MessageCircleQuestion,
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
    body: "Add your accounts once in Settings, then pick one from the project's menu in the sidebar, under Always use one account, where each account shows its 5-hour and weekly usage. From then on every terminal you open in the project launches Claude Code on that account. Projects without a pin keep your main login, so nothing changes until you ask it to.",
  },
  {
    icon: Layers,
    title: "Accounts run in parallel",
    body: "The work project runs the company seat while the side project runs your personal subscription, at the same time. There is no global “active account” to flip and no restart ripple across running sessions.",
  },
  {
    icon: KeyRound,
    title: "Sign in once per account",
    body: "Click Add account in Settings, give it a name, and Add and sign in opens Claude's own sign-in for it. Its row then shows the plan, the email, its 5-hour and weekly usage, and which projects use it, and every terminal on a project pinned to it is already signed in.",
  },
  {
    icon: ShieldCheck,
    title: "Your tokens stay where Claude put them",
    body: "lpm never reads, copies, or exports credentials. Each account gets its own Claude Code home, and Claude Code itself stores each login where it always does (in the Keychain on macOS) — exactly as it does for a single account. lpm keeps no token files of its own to back up, restore, or leak.",
  },
  {
    icon: FolderSync,
    title: "Your setup follows every account",
    body: "Your settings, CLAUDE.md memory, skills, subagents, slash commands, and plugins are shared across accounts. User-level MCP servers and past sessions stay with each account. lpm's agent status keeps working too.",
  },
  {
    icon: Wand2,
    title: "Built-in AI features use the project's account",
    body: "Commit messages, PR titles and descriptions, branch names, merge-conflict resolution, and composer rewrites all run on the project's account, not just the terminals.",
  },
  {
    icon: ArrowLeftRight,
    title: "Switch when one runs low",
    body: "Turn on Switch accounts automatically and new Claude sessions start on the first account in your list that is under 90% of its 5-hour and weekly limits. Up to three accounts take turns, in the order you drag them. Sessions already running stay on their account.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Ask first, or switch on its own",
    body: "With Ask me first, lpm asks in the sidebar before new sessions move to the next account, and Use or Not now is your call. With Switch on its own, it moves them and tells you why.",
  },
  {
    icon: ListOrdered,
    title: "A list of its own for any project",
    body: "Choose accounts in a project's menu to give it its own ordered list of up to three accounts. It takes turns only on those, while other projects follow the main list or stay pinned.",
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/50 dark:bg-white/[0.02]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it works"
          title="Per-project Claude accounts, built into your terminal"
          description="Not a credential swapper — a project workspace that knows which account each project uses, and which one has room."
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
