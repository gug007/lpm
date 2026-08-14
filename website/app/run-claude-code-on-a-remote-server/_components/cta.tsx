import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section className="py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Your Mac is the cockpit.
          <br className="hidden sm:block" /> The server does the hours.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Download lpm for macOS, type{" "}
          <code className="font-mono text-[0.9em]">user@your-server</code> in
          Settings → Connections, and let Claude Code and Codex work on a
          machine that never sleeps.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload source="linux-host-cta" />
        </div>

        <div className="mt-8">
          <GithubLink
            source="linux-host-cta"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            View the open-source project
          </GithubLink>
        </div>
      </div>
    </section>
  );
}
