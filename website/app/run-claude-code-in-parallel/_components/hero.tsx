import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.11),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.15),transparent_32%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.13),transparent_30%)]" />
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-sky-700 dark:text-sky-300/70 mb-5">
          Parallel coding agents
        </p>
        <h1 className="text-balance text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Run Claude Code in parallel&nbsp;— without losing track.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Open several Claude Code or Codex sessions side by side, or give each
          agent its own copy of the project in one step. lpm shows which one is
          working, which needs you and which is done — and keeps every diff one
          shortcut away.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="parallel-hero" />
        </div>

        <a
          href="#three-ways"
          className="mt-[clamp(0.5rem,1.5vh,1rem)] inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Compare the three ways
          <ArrowDown className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>
    </section>
  );
}
