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
    body: "Toggle individual services, watch their logs, trigger a saved action (a test run, a linter, a deploy), and open, close, rename, pin, or reorder terminals. It all runs on your Mac; running an action or opening a terminal needs the lpm window open there.",
  },
  {
    icon: Copy,
    title: "Duplicate a project and fan out",
    body: "Make up to 50 standalone copies with labels and a group folder, choose committed work only, pull latest, or reinstall dependencies, and run an action or command in each. A progress bar tracks the batch, and a copy you're done with can be deleted, folder and all.",
  },
  {
    icon: FolderTree,
    title: "Run one prompt across fresh copies",
    body: "Long-press Send to run a prompt in 2 to 10 copies at once: this terminal counts as the first, and fresh copies of the project take the rest. Try one idea a few ways and keep the best result.",
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
