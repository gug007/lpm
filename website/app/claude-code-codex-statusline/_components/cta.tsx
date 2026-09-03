import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroDownload } from "@/components/home/hero-download";
import { AI_AGENTS_PATH } from "@/lib/links";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl">
          Put Claude Code and Codex in one visible workspace.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
          lpm keeps agents, statuslines, services, logs, Git changes, and project
          copies together in one native macOS app.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source="statusline-cta" />
        </div>
        <div className="mt-8">
          <Link
            href={AI_AGENTS_PATH}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
          >
            See the complete AI agent workflow
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
