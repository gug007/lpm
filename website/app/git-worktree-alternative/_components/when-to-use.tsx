import Link from "next/link";
import { ArrowRight, Check, CircleAlert, GitBranch } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { WORKTREE_AGENTS_PATH } from "@/lib/links";
import { INLINE_CODE } from "./page-styles";
import { DUPLICATE_LIMITS, WORKTREE_WINS } from "./when-to-use-data";

export default function WhenToUse() {
  return (
    <section id="when-to-use" className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Choose the right tool"
          title="When a Git worktree is still the better choice"
          description="A worktree is the lighter tool when a clean branch is all you need. Here is when to reach for one, and what to know before you duplicate."
          className="mb-12"
        />

        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-gray-200 p-6 sm:p-8 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                <GitBranch className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Pick a Git worktree when…
              </h3>
            </div>
            <ul className="mt-6 space-y-4">
              {WORKTREE_WINS.map(({ title, body }) => (
                <li key={title} className="flex gap-3">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300"
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {title}
                    </span>{" "}
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-gray-200 p-6 sm:p-8 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                <CircleAlert className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Know before you duplicate
              </h3>
            </div>
            <ul className="mt-6 space-y-5">
              {DUPLICATE_LIMITS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-white/[0.06]">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <aside
          id="lpm-worktrees"
          className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-6 sm:p-8 dark:border-blue-900/60 dark:bg-blue-400/[0.035]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
              <GitBranch className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                lpm makes real worktrees too
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Right-click a project and choose New Worktree. It opens the same
                dialog as Duplicate, but each result is a linked Git worktree on
                a fresh <code className={INLINE_CODE}>lpm/&lt;name&gt;</code>{" "}
                branch from the commit you&apos;re on. Removing one deletes its
                branch too, even if it isn&apos;t merged.
              </p>
              <Link
                href={WORKTREE_AGENTS_PATH}
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 underline decoration-blue-300 underline-offset-4 hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-700 dark:hover:decoration-blue-300"
              >
                Git worktrees for Claude Code and Codex
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
