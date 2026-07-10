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
    body: "Add your accounts once in Settings, then assign one in the project's config. From that point every terminal you open in the project launches Claude Code on that account. Projects without a pin keep using your main login — nothing changes until you ask it to.",
  },
  {
    icon: Layers,
    title: "Accounts run in parallel, not in turns",
    body: "This is a pin, not a switch. The work project runs the company seat while the side project runs your personal subscription — simultaneously, in adjacent panes. There is no global “active account” to flip and no restart ripple across running sessions.",
  },
  {
    icon: KeyRound,
    title: "Sign in once per account",
    body: "The first terminal you open on a pinned project walks through Claude's normal browser sign-in for that account. That's the last time you see it. Every later terminal, on any project pinned to that account, is already signed in.",
  },
  {
    icon: ShieldCheck,
    title: "Your tokens stay where Claude put them",
    body: "lpm never reads, copies, or exports credentials. Each account gets its own Claude Code home, and Claude Code itself keeps each login in the macOS Keychain — exactly as it does for a single account. No token files to back up, restore, or leak.",
  },
  {
    icon: FolderSync,
    title: "Your setup follows every account",
    body: "Settings, memory, skills, and slash commands are shared across accounts automatically, so a pinned project feels identical to your main one — same tools, same shortcuts, different login. lpm's agent status badges keep working too.",
  },
  {
    icon: Wand2,
    title: "Built-in AI features respect the pin",
    body: "Commit messages, PR titles and descriptions, branch names, merge-conflict resolution, and composer text actions all run on the project's pinned account — not just the terminals. Whatever a project does with Claude, it does as the right identity.",
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
