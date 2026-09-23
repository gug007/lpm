import Link from "next/link";
import { ArrowRight, FileDiff, GitPullRequest, Trash2 } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { REVIEW_CHANGES_PATH } from "@/lib/links";

const STEPS = [
  {
    icon: FileDiff,
    shortcut: "⌘⇧R",
    title: "Read every diff",
    body: "Open any copy and see all of its uncommitted changes as one scrolling stack of diffs, split or unified. Fix a line right in the diff before you commit.",
  },
  {
    icon: GitPullRequest,
    title: "Commit or open a PR with AI",
    body: "Have your own agent CLI write the commit message from the diff, or run Auto Create PR: commit, push and an AI-written pull request in one step, on a new branch if you’re on the default one.",
    note: "Pull requests need GitHub and the gh CLI.",
  },
  {
    icon: Trash2,
    title: "Delete the rest",
    body: "Remove the attempts you don’t keep. A copy’s folder is deleted from disk; deleting a worktree deletes its branch too, so push anything you want first.",
  },
];

export default function ReviewShip() {
  return (
    <section id="review" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Review and ship"
          title="Compare the runs. Ship the one you keep."
          description="Every copy and worktree is a project of its own, with the same review and Git tools as the original."
        />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, shortcut, title, body, note }, i) => (
            <li
              key={title}
              className="relative flex flex-col rounded-2xl border border-gray-200 bg-gray-50/40 p-6 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {title}
                {shortcut && (
                  <kbd className="rounded border border-gray-200 px-1 font-sans text-[11px] font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {shortcut}
                  </kbd>
                )}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {body}
              </p>
              {note && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{note}</p>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center text-sm">
          <Link
            href={REVIEW_CHANGES_PATH}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            How reviewing agent changes works in lpm
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
