import Link from "next/link";
import { AutoVideo } from "@/components/auto-video";
import { SectionHeader } from "@/components/section-header";
import { PARALLEL_PATH } from "@/lib/links";

const MODES = [
  {
    name: "lpm Worktree",
    title: "Linked worktrees, created in a batch",
    body: "Each one is a real Git worktree on a new branch from your current commit, sharing the repository. Uncommitted and ignored files stay behind, the same as raw Git. Tick Install dependencies when the worktree needs them.",
    points: [
      "Deleting one also deletes its branch, so merge or push anything you want to keep first",
      "Needs a Git repository with at least one commit, with the project at its root",
    ],
  },
  {
    name: "lpm Duplicate",
    title: "Standalone copies of the project you have now",
    body: "An APFS copy-on-write clone with its own Git repository, carrying uncommitted work, ignored files, and installed dependencies. Regenerable build caches are left behind.",
    points: [
      "Pulls the latest commits by default; optionally keep committed work only or reinstall dependencies",
      "Each copy is independent, so several can sit on the same branch",
    ],
  },
];

const STEPS = [
  "Right-click a project and choose Duplicate for standalone copies or New Worktree for linked worktrees, then set how many, up to 50.",
  "Label them, group them in the sidebar, and pick the action or command each one should run, with the prompt to send. Each copy can get its own.",
  "Watch every copy's agent status from the sidebar, review the diffs, and delete the copies you do not keep. Deleting is permanent.",
];

export default function FanOut() {
  return (
    <section id="fan-out" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="One prompt, three agents"
          title="Both primitives, the same fan-out"
          description="lpm does not ask you to give up worktrees. Pick the kind from the project menu, and both share the same fan-out form for queuing the work."
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
          Code, Codex, Gemini CLI, and OpenCode, so an agent asked to try three
          approaches can create its own copies, run the work in them, wait for
          the others to settle, and clean them up when you have merged the one
          you want. Already typing the prompt? Choose Run in duplicates from the
          composer&rsquo;s send menu to run it here and in fresh copies at
          once, or read the full{" "}
          <Link
            href={PARALLEL_PATH}
            className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
          >
            guide to running Claude Code in parallel
          </Link>
          .
        </p>

        <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-950 shadow-2xl shadow-gray-200/60 dark:border-gray-800 dark:shadow-black/40">
          <AutoVideo
            src="/screenrecording/agent-duplicate-fanout.mp4"
            poster="/screenrecording/agent-duplicate-fanout-poster.jpg"
            width={1224}
            height={804}
            label="Fanning one prompt out to three project copies in lpm, each running its own coding agent"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
