import { ArrowRight, Monitor, Play } from "lucide-react";
import { DEMO_ANCHOR, REPO_URL } from "@/lib/links";
import { HeroDownload } from "./hero-download";
import { ProofStrip } from "./proof-strip";

export function Hero() {
  return (
    <section className="relative pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid"
      />
      <div className="relative max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          Local Project Manager
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          Switch between projects and terminals in seconds
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed tracking-wide">
          lpm starts, stops, and duplicates your local dev projects — every
          service streaming live, with one-click terminals for Claude Code and
          Codex. Free, open source, native macOS.
        </p>

        <div className="mt-10 max-w-xl mx-auto space-y-4 text-left">
          <div>
            <div className="mb-2">
              <div className="flex justify-center items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-400">
                <Monitor className="w-3 h-3" />
                <span>Desktop App</span>
              </div>
            </div>
            <HeroDownload />
          </div>
          <div className="flex justify-center">
            <a
              href={DEMO_ANCHOR}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
            >
              <Play className="w-3.5 h-3.5" aria-hidden />
              Try the interactive demo
            </a>
          </div>
        </div>

        <ProofStrip />

        <div className="mt-8">
          <a
            href={REPO_URL}
            className="text-[13px] text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            View on GitHub
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
