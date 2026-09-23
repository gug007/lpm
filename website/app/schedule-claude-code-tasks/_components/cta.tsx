import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          Put your agents on a schedule.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-gray-500 sm:text-lg dark:text-gray-400">
          Download lpm for macOS, open Automations, and give Claude Code or
          Codex its first night shift. Free and open source.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source="automations-cta" />
        </div>
        <div className="mt-8">
          <GithubLink
            source="automations-cta"
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
          >
            View the source on GitHub
          </GithubLink>
        </div>
      </div>
    </section>
  );
}
