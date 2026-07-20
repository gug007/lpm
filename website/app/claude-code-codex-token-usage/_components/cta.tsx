import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";

export default function Cta() {
  return (
    <section className="py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl">
          Stop guessing where the tokens went.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed tracking-wide text-gray-500 dark:text-gray-400 sm:text-lg">
          Download lpm for macOS, run Claude Code and Codex in your configured
          projects, and turn local usage metadata into answers you can act on.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>
        <div className="mt-8">
          <a
            href={REPO_URL}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
          >
            View the source on GitHub
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
