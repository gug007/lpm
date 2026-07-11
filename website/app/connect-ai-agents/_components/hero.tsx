import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";

export default function Hero() {
  return (
    <section className="pt-28 sm:pt-40 pb-8 sm:pb-12 text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          Connect AI coding agents
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          Let your AI agents run
          <br className="hidden sm:block" />
          your dev environment.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed tracking-wide">
          One click installs an agent skill and the <code className="font-mono text-[0.9em]">lpm</code> command-line
          tool. From then on Claude Code, Codex, Gemini CLI, and OpenCode can
          start, stop, and restart your services, read dev-server logs, wait for
          a port, report status, and fan out into parallel copies of a
          project — no per-project setup.
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
