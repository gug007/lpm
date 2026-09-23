import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { PARALLEL_PATH } from "@/lib/links";

type Outcome = {
  title: string;
  body: React.ReactNode;
};

const OUTCOMES: Outcome[] = [
  {
    title: "A second agent starts on a copy that already runs",
    body: "Duplicate clones the project folder, so the new copy arrives with node_modules, .venv, .env files, and your uncommitted work in place. Only rebuildable caches like .next and dist are left out. Want a branch instead? New Worktree makes a real Git checkout of your current commit. It starts clean, so uncommitted changes and ignored files like node_modules and .env stay behind in the original.",
  },
  {
    title: "One prompt, several answers to choose from",
    body: (
      <>
        Write the prompt once and choose Run in duplicates: it starts in this
        tab and in new copies of the repo, one agent per folder. Pick 2 to 10
        runs; the Duplicate dialog it opens lets you change the count before
        anything starts, and the same prompt is queued in each. You keep the
        version you like instead of rerolling one session and hoping. The full
        walkthrough lives on{" "}
        <Link
          href={PARALLEL_PATH}
          className="font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          running Claude Code in parallel
        </Link>
        .
      </>
    ),
  },
  {
    title: "Any conversation picks up where you left it",
    body: "The resume picker lists every Claude Code and Codex conversation for the project, including ones started outside lpm and tabs you closed. Fork a conversation into a new tab to try another direction, or copy the last answer as clean text with its tables intact. After a relaunch, agent tabs reopen on the conversation they had.",
  },
  {
    title: "You see how much of your plan the agents have burned",
    body: "Claude and Codex each get a usage bar in the sidebar with its reset time, for the window you pick: weekly out of the box, the 5-hour window, or whichever of the two is higher. A pace marker shows whether you are burning faster than the clock, and each Claude account you add gets its own row. Codex needs no setup; Claude tracking is one click in the Usage window.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Why the desktop app"
          title="What changes when you run agents in a real macOS window"
        />
        <ol className="space-y-10">
          {OUTCOMES.map(({ title, body }, i) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] gap-x-6 sm:gap-x-8 items-start"
            >
              <span
                aria-hidden="true"
                className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
