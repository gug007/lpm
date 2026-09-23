import Link from "next/link";
import {
  FileDiff,
  GitBranchPlus,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestArrow,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { REVIEW_CHANGES_PATH } from "@/lib/links";
import { GitBarReplica } from "./git-bar-replica";

type Tool = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const TOOLS: Tool[] = [
  {
    icon: FileDiff,
    title: "Diff review",
    body: (
      <>
        ⌘⇧R stacks every uncommitted change in one scrolling view, split or
        unified, and you can fix a line right in the diff. More on{" "}
        <Link
          href={REVIEW_CHANGES_PATH}
          className="font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          reviewing changes in the terminal
        </Link>
        .
      </>
    ),
  },
  {
    icon: GitBranchPlus,
    title: "Branch switcher",
    body: "Search local and remote branches, check one out with Enter, or create a new one with an AI-suggested name. Rename and delete from the same list.",
  },
  {
    icon: GitCommitHorizontal,
    title: "Commit dialog",
    body: "Tick files or whole folders, let your AI agent draft the message, then Commit or Commit and Push. Auto Commit does all of it in the background.",
  },
  {
    icon: GitPullRequestArrow,
    title: "Pull requests",
    body: "Create PR writes the title and description and opens it on GitHub through the gh CLI. The footer then shows the branch's PR number and state.",
  },
  {
    icon: GitMerge,
    title: "Merge with help",
    body: "Merge another branch in from a dialog. If it conflicts, Resolve with AI fixes the markers and stages the result for you to review.",
  },
  {
    icon: Undo2,
    title: "Discard, carefully",
    body: "Throw away changes to one file, a folder, or everything, with a confirmation each time.",
  },
];

export default function ReviewCommit() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="When you'd rather click"
          title="Diff review, commits, and PRs built into the window"
          description="Your shell git stays untouched. Next to it, lpm adds the everyday git loop as buttons, with AI drafting the words through the agent CLI you already have."
          className="mb-12"
        />
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
          <div className="lg:sticky lg:top-24">
            <GitBarReplica />
          </div>
          <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {TOOLS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-white/[0.06]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 text-center text-xs text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          No branch graph and no hunk-by-hunk staging: the commit dialog commits
          whole files, and your shell is there for everything else.
        </p>
      </div>
    </section>
  );
}
