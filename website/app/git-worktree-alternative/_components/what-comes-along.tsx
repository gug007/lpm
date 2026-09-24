import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import FolderExplorer from "./folder-explorer";
import FolderStatus from "./folder-status";
import { STATE_LABEL, type ItemState } from "./explorer-data";
import { INLINE_CODE } from "./page-styles";

const LEGEND: ItemState[] = ["present", "differs", "missing", "rebuilt"];

export default function WhatComesAlong() {
  return (
    <section id="what-comes-along" className="pb-16 pt-10 sm:pb-20 sm:pt-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Git worktree limitations"
          title="Why not just use git worktree?"
          className="mb-4"
        />
        <p className="mx-auto max-w-2xl text-pretty text-center text-[15px] leading-relaxed text-gray-600 dark:text-gray-400 sm:text-base">
          The main limitation of a Git worktree: it checks out committed files
          on a new branch. Your <code className={INLINE_CODE}>.env</code> files,{" "}
          <code className={INLINE_CODE}>node_modules</code> and uncommitted
          edits stay behind, and by default Git refuses a branch that&apos;s
          already checked out elsewhere. A copy of the project folder brings all
          three, on the same branch. lpm makes that copy with Duplicate, and
          real worktrees with New Worktree.
        </p>

        <figure className="mt-8 sm:mt-10">
          <figcaption className="mx-auto mb-5 max-w-3xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            <span className="block">
              Say you&apos;re mid-change in shop, a Next.js app on branch main:
              src/billing/trial.ts has an uncommitted edit, notes/todo.md is
              untracked, and .env, node_modules and .next are ignored by Git.
              Each panel shows the new folder that lands next to shop.
            </span>
            <span className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {LEGEND.map((state) => (
                <span key={state} className="inline-flex items-center gap-1.5">
                  <FolderStatus state={state} srLabel={false} />
                  {STATE_LABEL[state]}
                </span>
              ))}
            </span>
          </figcaption>
          <FolderExplorer />
        </figure>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Each of these gaps is fixable by hand or with a setup script.{" "}
          <a
            href="#lpm-worktrees"
            className="inline-flex items-center gap-1 font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
          >
            lpm makes real worktrees too
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      </div>
    </section>
  );
}
