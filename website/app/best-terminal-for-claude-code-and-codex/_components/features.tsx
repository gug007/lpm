import {
  FolderKanban,
  LayoutGrid,
  Moon,
  MousePointerClick,
  SlidersHorizontal,
  SquarePen,
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
    icon: LayoutGrid,
    title: "Every service, side by side",
    body: (
      <>
        Watch live terminal output from every service in one window. No more
        tab-juggling to find which agent broke the API while the other is
        editing the frontend.
      </>
    ),
  },
  {
    icon: FolderKanban,
    title: "Visual project sidebar",
    body: (
      <>
        Every project sits in the sidebar. Click to jump straight to one with
        agents already running — no hunting through terminal windows.
      </>
    ),
  },
  {
    icon: SquarePen,
    title: "Built-in config editor",
    body: (
      <>
        Edit a project&apos;s config inside the app and restart services on the
        spot. No digging through dotfiles to tweak what an agent is running.
      </>
    ),
  },
  {
    icon: MousePointerClick,
    title: "One-click actions",
    body: (
      <>
        Wire up buttons for tests, lints, and deploy scripts. Run them with a
        click while the agent keeps working next door.
      </>
    ),
  },
  {
    icon: SlidersHorizontal,
    title: "Toggle service profiles",
    body: (
      <>
        Flip between profiles from the app header to run just the services the
        agent touches — or spin up the full stack when you need it.
      </>
    ),
  },
  {
    icon: Moon,
    title: "Native, dark, and fast",
    body: (
      <>
        A real macOS app with dark mode, native speed, and no browser tab
        eating your battery while agents chew through your codebase.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Inside the app"
          title="A native workspace for the agents doing your work"
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
