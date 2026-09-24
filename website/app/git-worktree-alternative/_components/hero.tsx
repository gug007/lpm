import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { ProofStrip } from "@/components/home/proof-strip";
import { INLINE_CODE } from "./page-styles";

const JUMP_LINK =
  "inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.11),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_30%)]"
      />
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-700 dark:text-emerald-300/70 mb-5">
          Free, open-source Mac app
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          A Git worktree alternative that copies your whole project.
        </h1>
        <p className="mt-5 text-pretty text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
          lpm Duplicate copies the project you&apos;re actually working in,
          not just its committed files: uncommitted edits,{" "}
          <code className={INLINE_CODE}>.env</code> files and{" "}
          <code className={INLINE_CODE}>node_modules</code> come along into a
          standalone repository. Then it can start Claude Code, Codex or any
          command in each copy.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="worktree-alt-hero" />
        </div>

        <ProofStrip />

        <nav
          aria-label="On this page"
          className="mt-[clamp(0.75rem,2vh,1.25rem)] flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-5"
        >
          <a href="#what-comes-along" className={JUMP_LINK}>
            See what a worktree leaves behind
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </a>
          <span
            aria-hidden
            className="hidden text-gray-300 sm:inline dark:text-gray-700"
          >
            ·
          </span>
          <a href="#alternatives" className={JUMP_LINK}>
            Compare the alternatives
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </a>
        </nav>
      </div>
    </section>
  );
}
