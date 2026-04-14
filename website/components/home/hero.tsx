import { ArrowRight, Monitor, Terminal } from "lucide-react";
import { REPO_URL } from "@/lib/links";
import { CopyInstall } from "./copy-install";
import { HeroDownload } from "./hero-download";

export function Hero() {
  return (
    <section className="pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          Local Project Manager
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          Start projects in one click.<br className="hidden sm:block" />
          Run AI agents in parallel.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-lg mx-auto leading-relaxed tracking-wide">
          One click to start, stop, or duplicate your dev projects. Run Claude
          Code, Codex, and other AI agents in parallel on the same codebase —
          no conflicts, no context switching.
        </p>

        <div className="mt-10 max-w-xl mx-auto space-y-4 text-left">
          <div>
            <div className="mb-2 ml-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-400">
                <Monitor className="w-3 h-3" />
                <span>Desktop App</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                Native macOS app with live output and visual editor
              </p>
            </div>
            <HeroDownload />
          </div>

          <div>
            <div className="mb-2 ml-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-400">
                <Terminal className="w-3 h-3" />
                <span>CLI</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                Fast, scriptable commands straight from your terminal
              </p>
            </div>
            <CopyInstall />
          </div>
        </div>

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
