import { Check, CopyPlus, GitBranch } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const WORKTREE_REASONS = [
  "You only need another tracked checkout or branch",
  "Minimal disk use matters most",
  "Sharing refs and Git objects is useful",
  "Your setup is already automated for every new checkout",
];

const DUPLICATE_REASONS = [
  "The current uncommitted state should be the starting point",
  "Local config and installed dependencies should come along",
  "Every agent needs its own standalone Git repository",
  "You want to create, run, monitor, and remove copies in one workflow",
];

export default function WhenToUse() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Choose the right primitive"
          title="Worktree for a branch. Duplicate for an environment."
          description="lpm does not make Git worktree obsolete. It gives you a larger isolation boundary when the task includes the local setup and running workflow around the code."
          className="mb-12"
        />

        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-gray-200 p-6 sm:p-8 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                <GitBranch className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Choose Git worktree
                </p>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  Lightweight checkout isolation
                </h3>
              </div>
            </div>
            <ul className="mt-6 space-y-3">
              {WORKTREE_REASONS.map((reason) => (
                <li
                  key={reason}
                  className="flex gap-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300"
                    aria-hidden
                  />
                  {reason}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-6 sm:p-8 dark:border-emerald-900/60 dark:bg-emerald-400/[0.035]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                <CopyPlus className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
                  Choose lpm Duplicate
                </p>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  Complete project isolation
                </h3>
              </div>
            </div>
            <ul className="mt-6 space-y-3">
              {DUPLICATE_REASONS.map((reason) => (
                <li
                  key={reason}
                  className="flex gap-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                    aria-hidden
                  />
                  {reason}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
