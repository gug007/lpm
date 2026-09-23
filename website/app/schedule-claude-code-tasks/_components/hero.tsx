import { HeroDownload } from "@/components/home/hero-download";

const AGENTS = ["Claude Code", "Codex", "Gemini CLI", "OpenCode"];

export default function Hero() {
  return (
    <section className="relative pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative mx-auto max-w-4xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          Automations in lpm
        </p>
        <h1 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] dark:from-white dark:via-gray-100 dark:to-gray-400">
          Schedule Claude Code and Codex to run on their own.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          Give an agent a prompt and a schedule: every night, on weekdays, or
          every few hours. lpm runs it in your project, a fresh copy, or a Git
          worktree, and keeps every answer ready to read and reply to.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="automations-hero" />
        </div>

        <ul
          aria-label="Agents you can schedule"
          className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400"
        >
          {AGENTS.map((agent) => (
            <li key={agent} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1 w-1 rounded-full bg-gray-400 dark:bg-gray-500" />
              {agent}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
