import { ArrowRight } from "lucide-react";
import { REPO_URL } from "@/lib/links";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          The git terminal for Mac developers
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          The Mac terminal that keeps git and your dev servers in the same
          window.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide">
          lpm gives you a shell pane for branching, rebasing, and pushing right
          next to live service log panes — so you never toggle between a GUI git
          client and a separate terminal again. Native Apple Silicon, zero
          Electron.
        </p>

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
