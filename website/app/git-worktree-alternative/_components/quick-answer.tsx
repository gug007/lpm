import { ExternalLink } from "lucide-react";

export default function QuickAnswer() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.025]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            The short answer
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            What is the best Git worktree alternative for AI coding agents?
          </h2>
          <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            <p>
              Use lpm Duplicate when a second agent needs more than another
              branch checkout. It makes a standalone macOS project copy with
              its own Git repository, preserves the useful local state already
              on disk, inherits the project&rsquo;s lpm services and actions,
              and can queue the agent task as part of the same flow.
            </p>
            <p>
              Keep using{" "}
              <a
                href="https://git-scm.com/docs/git-worktree"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
              >
                Git worktree
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>{" "}
              when you want a lightweight, linked checkout and are happy to
              prepare its dependencies, local files, services, and agent
              session separately. Worktrees are excellent at that job; lpm
              solves a larger one.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
