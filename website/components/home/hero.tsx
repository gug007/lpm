import { HeroAgents } from "./hero-agents";
import { HeroCta } from "./hero-cta";

// The interactive demo sits directly below and has to reach the first
// viewport, so the hero's vertical rhythm tracks viewport height rather than
// stepping at width breakpoints.
export function Hero() {
  return (
    <section
      id="hero"
      className="relative pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid"
      />
      <div className="relative mx-auto max-w-5xl px-6">
        <HeroAgents />
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] dark:from-white dark:via-gray-100 dark:to-gray-400">
          Every project. Every agent.
          <br />
          One window.
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-balance text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          lpm runs your dev servers and AI coding agents side by side, so you
          stop juggling terminals.
        </p>

        <div className="mx-auto mt-[clamp(1.25rem,3vh,1.75rem)] max-w-4xl">
          <HeroCta appStoreSource="home-hero" />
        </div>
      </div>
    </section>
  );
}
