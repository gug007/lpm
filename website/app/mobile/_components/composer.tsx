import {
  AtSign,
  History,
  Image,
  Slash,
  Sparkles,
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
    icon: Sparkles,
    title: "Rewrite the prompt with AI",
    body: "Run any of your saved composer actions — or a free-form instruction — on the draft you're writing. Generate up to five variants, compare them, then pick and edit the one that says it best before you send.",
  },
  {
    icon: Slash,
    title: "Slash commands that know the agent",
    body: (
      <>
        Type <code className="text-xs">/</code> and get autocomplete for the
        commands the AI CLI in that terminal actually supports, argument hints
        and all. The menu adapts to whether it&rsquo;s Claude Code, Codex, or
        another agent.
      </>
    ),
  },
  {
    icon: AtSign,
    title: "@-mention real context",
    body: (
      <>
        Pull the agent&rsquo;s world into the prompt with <code className="text-xs">@</code>:
        changed files, any file or folder, a git branch, this terminal&rsquo;s
        recent output, or a service&rsquo;s logs — injected as context so you
        don&rsquo;t have to describe it by hand.
      </>
    ),
  },
  {
    icon: Image,
    title: "Attach a photo, screenshot, or file",
    body: "Add up to ten images from your library, snap one with the camera, paste a screenshot, or pick a file. lpm uploads it to your Mac and drops the path into the prompt so the agent can read it — a bug shot or a design reference, straight from the field.",
  },
  {
    icon: History,
    title: "Searchable prompt history",
    body: "Every prompt you've sent is saved, searchable, and infinite-scroll — plus drafts, favorites, and folders. Load an old prompt back into the composer to tweak it, or resend it as-is. Each terminal keeps its own draft, so nothing gets crossed.",
  },
];

export default function Composer() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The composer"
          title="A full prompt composer, not just a keyboard"
          description="The same composer you rely on in the desktop app — rewrites, slash commands, mentions, attachments, and history — rebuilt for your thumbs."
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
