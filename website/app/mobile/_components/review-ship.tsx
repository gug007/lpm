import {
  GitBranch,
  GitCommitVertical,
  GitPullRequest,
  MessageSquareText,
  ScanEye,
  UploadCloud,
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
    icon: ScanEye,
    title: "Read the diff, file by file",
    body: "A full review screen with GitHub-style inline diffs of every changed file, add and delete counts, viewed marks, collapse, and jump-to-file. It live-refreshes while the agent keeps editing, so you're always looking at the current state.",
  },
  {
    icon: GitCommitVertical,
    title: "Commit with an AI-written message",
    body: "Select the files you want, let lpm draft a commit message from the diff, tweak it if you like, and commit — right from your phone.",
  },
  {
    icon: UploadCloud,
    title: "Push, pull, and fetch",
    body: "Move the commit up to your remote, pull in what changed, or fetch to see where you stand — the everyday git plumbing, one tap each.",
  },
  {
    icon: GitBranch,
    title: "Switch branches",
    body: "Browse local and remote branches and check one out without touching the keyboard, so you can line up the right branch before the agent runs.",
  },
  {
    icon: GitPullRequest,
    title: "Open a pull request",
    body: "Create a GitHub PR straight from the review screen, with a title and body drafted for you from the changes — the last step of shipping, done from the couch.",
  },
  {
    icon: MessageSquareText,
    title: "Ask the agent about a diff",
    body: "Spotted something off? Send that file's diff to any running terminal as a prompt and ask the agent to explain or fix it. Or discard everything and start clean.",
  },
];

export default function ReviewShip() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Review &amp; ship"
          title="Review the diff and ship it — all from your phone"
          description="The change your agent just made doesn't have to wait for you to get back to your desk. Read it, commit it, push it, and open the PR from wherever you are."
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
