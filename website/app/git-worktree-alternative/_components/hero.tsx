import { ArrowDown, CopyPlus, GitBranch } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

const WORKTREE_POINTS = [
  "A linked checkout from a commit or branch",
  "Shared Git objects, refs, and repository config",
  "Minimal disk overhead",
];

const DUPLICATE_POINTS = [
  "A standalone folder with its own .git directory",
  "Current local state and dependencies carried over",
  "Agent task, services, and terminals managed together",
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-40 pb-16 sm:pb-24">
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.11),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_30%)]" />
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-700/70 dark:text-emerald-300/70 mb-6">
          Git worktree alternative for macOS
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] bg-gradient-to-br from-gray-950 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          A Git worktree alternative that duplicates the whole dev environment.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed tracking-wide">
          Git worktrees isolate tracked files. lpm Duplicate creates fast,
          standalone copies of the project you are actually working in —
          including its current state and local setup — then runs Claude Code,
          Codex, or any command in each copy.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <a
          href="#comparison"
          className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Compare before downloading
          <ArrowDown className="w-3.5 h-3.5" aria-hidden />
        </a>

        <div className="mt-14 grid gap-4 md:grid-cols-2 text-left">
          <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.025]">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                <GitBranch className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Git primitive
                </p>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  Linked worktree
                </h2>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
              {WORKTREE_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5 leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-500"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-gray-100 pt-4 text-xs font-medium text-blue-700 dark:border-gray-800 dark:text-blue-300">
              Best for lightweight branch checkouts
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-6 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                <CopyPlus className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  lpm primitive
                </p>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  Standalone Duplicate
                </h2>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
              {DUPLICATE_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5 leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-emerald-100 pt-4 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-300">
              Best for complete, parallel agent runs
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
