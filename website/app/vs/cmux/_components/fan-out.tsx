import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { WORKTREE_AGENTS_PATH } from "@/lib/links";

type CopyMode = {
  name: string;
  body: string;
};

const COPY_MODES: CopyMode[] = [
  {
    name: "Worktree",
    body: "A real linked worktree per agent, on its own branch. Git carries tracked files only, so neither your .env nor your installed dependencies arrive — flip on Install dependencies when the copy needs them.",
  },
  {
    name: "Standalone copy",
    body: "The project as it sits on disk right now, with its own Git repository, so two agents can attempt the same branch.",
  },
];

export default function FanOut() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="One prompt, three agents"
          title="Where a tab stops being enough"
          description="Three agent tabs in one folder are three agents editing the same files."
          className="mb-12"
        />

        <p className="text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
          Duplicate turns the count into projects instead. Pick worktrees or
          standalone copies, set how many — up to 50 — choose the action or
          command each one runs, and type the prompt once. Every copy inherits
          the project&apos;s services and actions, and the sidebar shows what
          each agent is doing.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {COPY_MODES.map((mode) => (
            <article
              key={mode.name}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {mode.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {mode.body}
              </p>
            </article>
          ))}
        </div>

        <p className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/60 p-6 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          None of this isolates a port or a database. What lpm does is check
          every declared port as the copy comes up, and name whatever is already
          sitting on one — a warning at the door, not a partition. See{" "}
          <Link
            href={WORKTREE_AGENTS_PATH}
            className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
          >
            the isolation models compared
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
