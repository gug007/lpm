import ParallelWindow from "./parallel-window";

export default function ParallelVisual() {
  return (
    <section className="pb-2">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="sr-only">
          An illustration of one lpm window with five coding agents at once. The
          selected project, shop-api, is split into two panes: Claude Code is
          working on a login rate limit, and Codex is waiting for approval to
          run a command. The sidebar lists shop-api with two copies and a Git
          worktree beneath it, each with its own agent marked working, done or
          problem and how long it has been at it. The prompt box under Claude
          Code has its send menu open on Run in duplicates, set to three runs.
        </p>

        <ParallelWindow />

        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Two agents split side by side in one project, three more in its copies
          and worktree — and a new prompt about to run three ways. Every row
          says what its agent is doing and for how long.
        </p>
      </div>
    </section>
  );
}
