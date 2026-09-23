import { HeroDownload } from "@/components/home/hero-download";
import { AREAS } from "./areas";
import { FEATURE_COUNT } from "./feature-areas";

export default function Hero() {
  return (
    <section className="relative pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative mx-auto max-w-4xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          Feature guide
        </p>
        <h1 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] dark:from-white dark:via-gray-100 dark:to-gray-400">
          What lpm does, from dev servers to Claude Code and Codex
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          lpm is a free, open-source Mac app for your local projects and the AI
          agents working in them. This guide walks through {FEATURE_COUNT} features
          in {AREAS.length} areas, with the fine print where it matters.
        </p>
        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="features-hero" />
        </div>
      </div>
    </section>
  );
}
