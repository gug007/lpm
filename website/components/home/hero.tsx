import { HeroCta } from "./hero-cta";
import { ProofStrip } from "./proof-strip";

// The interactive demo sits directly below and has to reach the first
// viewport, so the hero's vertical rhythm tracks viewport height rather than
// stepping at width breakpoints.
export function Hero() {
  return (
    <section className="relative pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid"
      />
      <div className="relative mx-auto max-w-5xl px-6">
        <p className="mb-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-emerald-500/90 dark:bg-emerald-400/90"
          />
          Built for Mac developers
        </p>
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] dark:from-white dark:via-gray-100 dark:to-gray-400">
          Every project. Every agent.
          <br />
          One window.
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          lpm is a free, open-source Mac app for local dev projects: switch in
          one click, see every service&apos;s live output, and run Claude Code
          and Codex side by side
          <span className="hidden sm:inline">
            , plus duplicates in seconds
          </span>
          .
        </p>

        <div className="mx-auto mt-[clamp(1.25rem,3vh,1.75rem)] max-w-3xl">
          <HeroCta />
        </div>

        <ProofStrip />
      </div>
    </section>
  );
}
