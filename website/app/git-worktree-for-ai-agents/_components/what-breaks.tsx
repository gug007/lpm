import { SectionHeader } from "@/components/section-header";

type Gap = {
  title: string;
  symptom: string;
  symptomIsCode?: boolean;
  why: string;
  fix: string;
  fixed: boolean;
};

const GAPS: Gap[] = [
  {
    title: "Your .env and other ignored files are gone",
    symptom:
      "The agent starts, the app boots, and every environment variable is undefined.",
    why: "git worktree add checks out tracked files only. Anything in .gitignore — .env, .env.local, local certificates, editor settings — was never in the commit, so it is never in the worktree.",
    fix: "Claude Code reads a .worktreeinclude file and copies gitignored files that match it. That applies to worktrees Claude creates. For everything else you copy them yourself, or start from a copy of the project instead of a checkout.",
    fixed: true,
  },
  {
    title: "node_modules is empty in every new worktree",
    symptom:
      "Ten minutes of install per agent, and a few hundred megabytes each, before any work starts.",
    why: "Dependencies are ignored files too. A fresh checkout has none of them, and symlinking one shared directory breaks resolution in tools that walk the real path.",
    fix: "Install per worktree and accept the cost, or duplicate the project so the already-installed dependencies come with it.",
    fixed: true,
  },
  {
    title: "The work in progress on your desk does not come along",
    symptom:
      "You ask an agent to continue what you were doing, and it starts from a commit you moved past hours ago.",
    why: "A worktree branches from a commit. Claude Code branches from your default branch by default, or from local HEAD when worktree.baseRef is set to head. Neither reproduces uncommitted edits or untracked files.",
    fix: "Commit or stash first, or copy the working project rather than checking one out.",
    fixed: true,
  },
  {
    title: "Two agents cannot try the same branch",
    symptom: "fatal: 'main' is already checked out at '/path/to/repo'",
    symptomIsCode: true,
    why: "Linked worktrees share one repository, and Git refuses to check out a branch in two of them — a commit in one would leave the other pointing at a stale state of the same branch.",
    fix: "Give each agent its own branch, or give each one an independent repository so the restriction no longer applies.",
    fixed: true,
  },
  {
    title: "Ports, databases, and Docker volumes are still shared",
    symptom:
      "The second dev server cannot bind. Two agents run migrations against one database and corrupt each other's fixtures.",
    why: "Every isolation model on this page draws its boundary at the filesystem. Nothing about a separate directory reserves a port, namespaces a Postgres schema, or forks a Docker volume.",
    fix: "No worktree model solves this, and lpm does not solve it yet either. What lpm does today is catch it: it checks declared ports before a project starts, tells you which process is holding one, and can free it or stop the start. Giving every copy its own ports is what we are building next. Until it lands, real runtime isolation means per-copy configuration, separate services, or containers.",
    fixed: false,
  },
];

export default function WhatBreaks() {
  return (
    <section id="gaps" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Before you fan out"
          title="Five things a Git worktree does not carry"
          description="Creating the worktree is one command. These are the five reasons the agent inside it still cannot run your project."
          className="mb-12"
        />

        <ol className="space-y-5">
          {GAPS.map((gap, index) => (
            <li
              key={gap.title}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <div className="flex items-start gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold tabular-nums text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {index + 1}
                </span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {gap.title}
                </h3>
              </div>
              <dl className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
                <div className="px-5 py-4">
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    What you see
                  </dt>
                  <dd className="mt-1.5 leading-relaxed text-gray-600 dark:text-gray-400">
                    {gap.symptomIsCode ? (
                      <code className="font-mono text-[0.9em]">
                        {gap.symptom}
                      </code>
                    ) : (
                      gap.symptom
                    )}
                  </dd>
                </div>
                <div className="px-5 py-4">
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    Why
                  </dt>
                  <dd className="mt-1.5 leading-relaxed text-gray-600 dark:text-gray-400">
                    {gap.why}
                  </dd>
                </div>
                <div
                  className={
                    gap.fixed
                      ? "bg-emerald-50/35 px-5 py-4 dark:bg-emerald-400/[0.03]"
                      : "bg-gray-50/70 px-5 py-4 dark:bg-white/[0.02]"
                  }
                >
                  <dt
                    className={`text-xs font-semibold uppercase tracking-widest ${
                      gap.fixed
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {gap.fixed ? "What fixes it" : "Where this stands"}
                  </dt>
                  <dd className="mt-1.5 leading-relaxed text-gray-700 dark:text-gray-300">
                    {gap.fix}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
