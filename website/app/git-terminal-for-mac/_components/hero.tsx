import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 mb-5">
          The git terminal for Mac developers
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Git terminal for Mac — run git and your dev servers in one window.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          lpm gives you a shell pane for branching, rebasing, and pushing right
          next to live service log panes — so you never toggle between a GUI git
          client and a separate terminal again. Native Apple Silicon, zero
          Electron.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="git-terminal-hero" />
        </div>

        <div className="mt-[clamp(1rem,2vh,1.5rem)]">
          <GithubLink
            source="git-terminal-hero"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          />
        </div>
      </div>
    </section>
  );
}
