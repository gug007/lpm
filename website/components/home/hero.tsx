import { Play } from "lucide-react";
import { DEMO_ANCHOR } from "@/lib/links";
import { HeroDownload } from "./hero-download";
import { ProofStrip } from "./proof-strip";

export function Hero() {
  return (
    <section className="relative pt-28 sm:pt-40 pb-10 sm:pb-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid"
      />
      <div className="relative max-w-4xl mx-auto px-6">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-emerald-500/90 dark:bg-emerald-400/90"
          />
          Built for Mac developers
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Switch between projects and terminals in seconds
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed tracking-wide">
          lpm starts, stops, and duplicates your local dev projects — every
          service streaming live, with one-click terminals for Claude Code and
          Codex. Free, open source, native macOS.
        </p>

        <div className="mt-9 max-w-xl mx-auto space-y-4">
          <HeroDownload />
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
      </div>
    </section>
  );
}
