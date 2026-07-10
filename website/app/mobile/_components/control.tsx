import {
  Copy,
  FolderTree,
  Play,
  SlidersHorizontal,
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
    icon: Play,
    title: "Start, stop, and switch projects",
    body: "Browse every project from your phone, grouped into the same sidebar folders as your Mac with live status badges. Start the whole stack with a profile, stop it, or spin up the API before you're back at your desk so it's ready when you sit down.",
  },
  {
    icon: SlidersHorizontal,
    title: "Run actions and manage terminals",
    body: "Toggle individual services, trigger a saved action — a test run, a linter, a deploy — and open, close, rename, pin, or reorder terminals. It all runs on your Mac in the normal flow and shows up the next time you look.",
  },
  {
    icon: Copy,
    title: "Duplicate a project and fan out",
    body: "Set copy count, labels, a group folder, and git options, optionally run an action or command in each copy, and watch per-copy progress stream in. When a copy has served its purpose, delete it — folder and all — right from your phone.",
  },
  {
    icon: FolderTree,
    title: "Run one prompt across fresh copies",
    body: "Straight from the composer, send a prompt to run in several duplicates at once — the current terminal plus fresh parallel copies — to try one idea a few ways and compare the results side by side.",
  },
];

export default function Control() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Project control"
          title="Drive the whole workspace, not just one terminal"
          description="Everything you do to a project on the Mac — start it, toggle services, run actions, duplicate and fan out — you can do from your phone."
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
