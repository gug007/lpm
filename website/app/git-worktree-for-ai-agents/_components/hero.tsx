import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

const LEVELS = [
  {
    tier: "Level 1",
    name: "A linked worktree",
    body: "Another checkout of the same repository. Isolates files. Carries nothing else.",
    tone: "blue" as const,
  },
  {
    tier: "Level 2",
    name: "A managed worktree",
    body: "The same checkout, created and torn down for you, with the agent already running in it.",
    tone: "gray" as const,
  },
  {
    tier: "Level 3",
    name: "A standalone copy",
    body: "The project as it exists on disk right now — local files, dependencies, uncommitted work — with its own Git repository.",
    tone: "emerald" as const,
  },
];

const TONES = {
  blue: "border-gray-200 dark:border-gray-800",
  gray: "border-gray-200 dark:border-gray-800",
  emerald:
    "border-emerald-200 bg-emerald-50/35 dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]",
};

const LABEL_TONES = {
  blue: "text-blue-700 dark:text-blue-300",
  gray: "text-gray-500 dark:text-gray-400",
  emerald: "text-emerald-700 dark:text-emerald-300",
};

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.11),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_30%)]" />
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-700/70 dark:text-emerald-300/70 mb-5">
          Parallel agents on macOS
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Git worktrees for Claude Code, Codex, and any coding agent.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
          Two agents in one folder overwrite each other. A worktree fixes that
          in one command — and then leaves you to rebuild the environment
          around it. This page covers what worktrees do for agents, what Claude
          Code and Codex now do natively, and the three levels of isolation you
          can choose between.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="worktree-agents-hero" />
        </div>

        <a
          href="#matrix"
          className="mt-[clamp(1rem,2vh,1.5rem)] inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Jump to the comparison
          <ArrowDown className="w-3.5 h-3.5" aria-hidden />
        </a>

        <div className="mt-[clamp(2rem,4.5vh,2.5rem)] grid gap-4 md:grid-cols-3 text-left">
          {LEVELS.map(({ tier, name, body, tone }) => (
            <article
              key={name}
              className={`rounded-2xl border p-6 shadow-sm ${TONES[tone]}`}
            >
              <p
                className={`text-xs font-medium uppercase tracking-widest ${LABEL_TONES[tone]}`}
              >
                {tier}
              </p>
              <h2 className="mt-2 font-semibold text-gray-900 dark:text-gray-100">
                {name}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
