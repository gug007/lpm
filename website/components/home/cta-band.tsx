import { GithubLink } from "@/components/github-link";
import { HeroCta } from "./hero-cta";

export function CtaBand() {
  return (
    <section className="py-16 sm:py-20 text-center">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl border border-gray-200 bg-gray-50/70 px-5 py-10 sm:px-10 sm:py-12 dark:border-gray-800 dark:bg-white/[0.025]">
          <h2 className="text-balance text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
            Try it on a project you already have
          </h2>
          <p className="mt-4 text-pretty text-base text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
            Add a folder and lpm sets up the dev servers it finds. Press Start,
            then open Claude Code or Codex next to them. Free, open source, and
            no account to create.
          </p>
          <div className="mt-8">
            <HeroCta
              source="home-cta"
              secondary={
                <GithubLink
                  source="home-cta"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-[13px] text-[15px] font-medium text-gray-700 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                >
                  View source on GitHub
                </GithubLink>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
