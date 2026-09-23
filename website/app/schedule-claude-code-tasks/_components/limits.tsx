import { Info } from "lucide-react";

const LIMITS = [
  {
    title: "Your Mac has to be awake",
    body: "Jobs run while lpm is open and the Mac is awake. A run missed while it slept or lpm was closed runs once when it's back; missed runs aren't replayed one by one.",
  },
  {
    title: "Full access means no approval prompts",
    body: "AI prompts default to Full access, which starts the agent without asking before it edits files or runs commands. Use Read only for jobs that should only report. OpenCode always runs with full access.",
  },
  {
    title: "One run of a job at a time",
    body: "If a job is due while its last run is still going, the new run is skipped, not queued. A run that goes past 60 minutes is stopped.",
  },
  {
    title: "Copies wait for your review",
    body: "A job that works in a fresh copy or worktree won't start the next run until you've looked at the last copy and removed it.",
  },
  {
    title: "A few at once, the rest wait",
    body: "Up to three automations run at the same time by default. Others due at that moment wait for a free slot.",
  },
  {
    title: "Local projects only",
    body: "Automations aren't available for SSH projects. Claude Code runs use your default Claude login, not an account pinned to the project.",
  },
];

export default function Limits() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div
          data-on-dark
          className="relative overflow-hidden rounded-[2rem] bg-[#0d0d0d] px-6 py-12 text-white ring-1 ring-black/10 dark:ring-white/10 sm:px-12 sm:py-14"
        >
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.05] blur-3xl" />
          <div className="relative">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70">
              <Info className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-6 max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              Know the rules before you walk away.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/60">
              Automations run inside the desktop app on your Mac, using the agent
              CLIs you already have installed and signed in. That comes with a
              few limits worth knowing up front.
            </p>
            <dl className="mt-8 grid gap-x-10 gap-y-5 sm:mt-10 sm:grid-cols-2 sm:gap-y-7">
              {LIMITS.map(({ title, body }) => (
                <div key={title} className="border-t border-white/10 pt-4 sm:pt-5">
                  <dt className="text-sm font-semibold text-white">{title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-white/60">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
