import { SectionHeader } from "@/components/section-header";

const MODES = [
  {
    name: "lpm Worktree",
    title: "Linked worktrees, created in a batch",
    body: "Each one is a real Git worktree on its own branch, sharing the repository. Ignored files are not carried over, the same as raw Git — tick the reinstall option when the copy needs its dependencies.",
    points: [
      "Real linked worktrees, removed with their branch when you delete them",
      "Lightest option when the checkout is all the agent needs",
    ],
  },
  {
    name: "lpm Duplicate",
    title: "Standalone copies of the project you have now",
    body: "An APFS copy-on-write clone with its own Git repository, carrying uncommitted work, ignored files, and installed dependencies. Regenerable build caches are left behind.",
    points: [
      "Optionally strip uncommitted changes, pull the latest commit, or reinstall dependencies",
      "Each copy is independent, so several can sit on the same branch",
    ],
  },
];

const STEPS = [
  "Open Duplicate, choose worktrees or standalone copies, and set how many — up to 50.",
  "Label them, group them in the sidebar, and pick the action or command each one should run, with the prompt to send.",
  "Watch every copy's agent status from the sidebar, review the diffs, and remove the copies you do not keep.",
];

export default function FanOut() {
  return (
    <section id="fan-out" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="One prompt, three agents"
          title="Both primitives, the same fan-out"
          description="lpm does not ask you to give up worktrees. The same dialog creates either kind, queues the work, and cleans up after it."
          className="mb-12"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {MODES.map((mode) => (
            <article
              key={mode.name}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {mode.name}
              </p>
              <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                {mode.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {mode.body}
              </p>
              <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                {mode.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
                  >
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-600"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <span className="text-xs font-semibold tabular-nums text-gray-300 dark:text-gray-700">
                0{index + 1}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {step}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          The agents can drive this themselves. lpm installs skills for Claude
          Code and Codex, so an agent asked to try three approaches can create
          its own copies, run the work in them, wait for the others to settle,
          and clean them up when you have merged the one you want.
        </p>

        <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-950 shadow-2xl shadow-gray-200/60 dark:border-gray-800 dark:shadow-black/40">
          <video
            src="/screenrecording/agent-duplicate-fanout.mp4"
            poster="/screenrecording/agent-duplicate-fanout-poster.jpg"
            width={1224}
            height={804}
            controls
            muted
            loop
            playsInline
            preload="none"
            aria-label="Fanning one prompt out to three project copies in lpm, each running its own coding agent"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
