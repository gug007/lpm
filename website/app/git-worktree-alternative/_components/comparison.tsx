import { SectionHeader } from "@/components/section-header";

type ComparisonRow = {
  topic: string;
  worktree: string;
  duplicate: string;
};

const ROWS: ComparisonRow[] = [
  {
    topic: "Git relationship",
    worktree:
      "A linked working tree that shares Git objects, refs, and repository config.",
    duplicate:
      "A standalone project folder with an independent .git directory.",
  },
  {
    topic: "Starting point",
    worktree:
      "Tracked files from a chosen commit or branch.",
    duplicate:
      "The project’s current on-disk state, fast-forwarded to the newest commits on its branch by default, with options to drop uncommitted changes or skip the pull.",
  },
  {
    topic: "Same branch in parallel",
    worktree:
      "Git refuses a branch already checked out elsewhere by default.",
    duplicate:
      "Each copy can stay on the same branch because its Git repository is independent.",
  },
  {
    topic: "Ignored and local files",
    worktree:
      "Not included by a normal checkout; hooks or tool-specific include rules can copy selected files.",
    duplicate:
      "Useful local files are copied by default while regenerable build caches are skipped.",
  },
  {
    topic: "Dependencies",
    worktree:
      "Each new checkout normally needs its environment initialized.",
    duplicate:
      "Existing dependencies come along by default, or lpm can install them fresh in each copy for Node projects.",
  },
  {
    topic: "Agent launch",
    worktree:
      "Git creates the checkout; agent tools or your own scripts handle the session.",
    duplicate:
      "The same flow can queue an lpm action, command, and prompt on every copy.",
  },
  {
    topic: "Dev stack",
    worktree:
      "Git does not manage services, logs, ports, or terminals.",
    duplicate:
      "Copies inherit the parent project’s lpm services, actions, profiles, and terminal setup.",
  },
  {
    topic: "Fan-out",
    worktree:
      "Create and prepare each worktree directly or automate it with another tool.",
    duplicate:
      "Create up to 50 labeled copies from a single dialog.",
  },
  {
    topic: "Ports and databases",
    worktree:
      "Shared: two checkouts running the same dev server still fight over its port and database.",
    duplicate:
      "Also shared. lpm checks declared ports when a copy starts and offers to free the port or stop.",
  },
  {
    topic: "Removal",
    worktree:
      "git worktree remove, then delete the branch yourself if you no longer need it.",
    duplicate:
      "Delete the copy from the sidebar. Its folder is removed from disk for good, not moved to the Trash.",
  },
  {
    topic: "Disk model",
    worktree:
      "Very compact because repository data is shared.",
    duplicate:
      "Fast APFS copy-on-write clone; storage grows as standalone copies diverge.",
  },
  {
    topic: "Platform",
    worktree:
      "Built into Git and available across platforms.",
    duplicate:
      "An instant APFS clone on your Mac. Also works for projects on a connected Linux server, and can create a copy on another connected Mac that has the project.",
  },
];

export default function Comparison() {
  return (
    <section id="comparison" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Git worktree vs lpm Duplicate"
          title="What gets copied is the real difference"
          description="A worktree isolates a checkout. lpm Duplicate copies the project around it (local files, dependencies and lpm setup), while ports, databases and Docker stay shared."
          className="mb-12"
        />

        <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025]">
                <th
                  scope="col"
                  className="w-[19%] px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                >
                  Capability
                </th>
                <th
                  scope="col"
                  className="w-[38%] px-5 py-4 text-left font-semibold text-gray-700 dark:text-gray-300"
                >
                  Git worktree
                </th>
                <th
                  scope="col"
                  className="w-[43%] bg-emerald-50/60 px-5 py-4 text-left font-semibold text-emerald-800 dark:bg-emerald-400/[0.045] dark:text-emerald-300"
                >
                  lpm Duplicate
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, index) => (
                <tr
                  key={row.topic}
                  className={
                    index < ROWS.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="px-5 py-4 text-left align-top font-medium text-gray-800 dark:text-gray-200"
                  >
                    {row.topic}
                  </th>
                  <td className="px-5 py-4 align-top leading-relaxed text-gray-500 dark:text-gray-400">
                    {row.worktree}
                  </td>
                  <td className="bg-emerald-50/35 px-5 py-4 align-top leading-relaxed text-gray-700 dark:bg-emerald-400/[0.025] dark:text-gray-300">
                    {row.duplicate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 md:hidden">
          {ROWS.map((row) => (
            <article
              key={row.topic}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <h3 className="border-b border-gray-200 bg-gray-50/80 px-5 py-3 text-sm font-semibold text-gray-900 dark:border-gray-800 dark:bg-white/[0.025] dark:text-gray-100">
                {row.topic}
              </h3>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Git worktree
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {row.worktree}
                </p>
              </div>
              <div className="border-t border-emerald-100 bg-emerald-50/40 p-5 dark:border-emerald-900/60 dark:bg-emerald-400/[0.035]">
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                  lpm Duplicate
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {row.duplicate}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
