import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Give every agent the whole project.
          <br className="hidden sm:block" />{" "}
          Not just another checkout.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Download lpm for macOS and turn the project already on your disk into
          clean, standalone environments for Claude Code, Codex, and any other
          terminal agent.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload source="worktree-alt-cta" />
        </div>

        <div className="mt-8">
          <GithubLink
            source="worktree-alt-cta"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            View the open-source project
          </GithubLink>
        </div>
      </div>
    </section>
  );
}
