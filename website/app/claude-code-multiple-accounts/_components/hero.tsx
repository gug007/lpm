import { ArrowRight } from "lucide-react";
import { REPO_URL } from "@/lib/links";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-40 pb-14 sm:pb-24 text-center">
      <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top_left,rgba(217,119,6,0.14),transparent_32%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(217,119,6,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.14),transparent_28%)]" />
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-700/70 dark:text-amber-300/70 mb-6">
          Account pinning
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] bg-gradient-to-br from-gray-950 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          Run multiple Claude Code accounts — one per project.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed tracking-wide">
          lpm pins a Claude Code account to each project. Work repos run on the
          company seat, side projects stay personal — at the same time, in one
          window. Sign in to each account once; after that, opening a project
          just uses the right one.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            one account per project
          </span>
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            accounts run in parallel
          </span>
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            no logout, no token copying
          </span>
        </div>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <div className="mt-8">
          <a
            href={REPO_URL}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          >
            View on GitHub
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
