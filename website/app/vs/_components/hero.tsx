import { ArrowDown } from "lucide-react";
import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="max-w-4xl mx-auto px-6">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/60 px-3 py-1 rounded-full mb-5">
          Mac dev stacks · seven tools
        </span>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          tmux, iTerm2, Docker Compose: seven ways to run a Mac dev stack.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Four processes, one repo, twenty times a day. Terminal tabs, a
          multiplexer, a Procfile runner, a container stack, a production
          supervisor — each solves part of it. Here is the whole field in one
          table, an honest verdict on each, and where lpm fits.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="vs-hub-hero" />
        </div>

        <a
          href="#matrix"
          className="mt-[clamp(0.5rem,1.5vh,1rem)] inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Jump to the table: seven tools and lpm
          <ArrowDown className="w-3.5 h-3.5" aria-hidden />
        </a>

        <div className="mt-[clamp(0.25rem,1vh,0.75rem)]">
          <GithubLink
            source="vs-hero"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          />
        </div>
      </div>
    </section>
  );
}
