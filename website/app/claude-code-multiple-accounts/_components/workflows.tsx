import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { PARALLEL_PATH, WORKTREE_ALTERNATIVE_PATH } from "@/lib/links";

const LINK =
  "font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Company seat and personal subscription on one Mac",
    body: (
      <>
        Pin the client repo to your company seat and leave the side project on
        your personal login. Both agents run at the same time, each spending
        its own subscription&rsquo;s usage, and clicking between projects in
        the sidebar is the only &ldquo;account switching&rdquo; you ever do.
      </>
    ),
  },
  {
    title: "Duplicate a project ×5 to fan out agents, and the copies keep the account",
    body: (
      <>
        lpm&rsquo;s{" "}
        <Link href={WORKTREE_ALTERNATIVE_PATH} className={LINK}>
          Duplicate
        </Link>{" "}
        and New Worktree flows spawn throwaway copies of a project to{" "}
        <Link href={PARALLEL_PATH} className={LINK}>
          run agents in parallel
        </Link>
        . Copies inherit the parent&rsquo;s pinned account, so five copies of
        the work repo all run as the work identity: no per-copy setup, and no
        agent quietly burning your personal quota because a fresh copy fell
        back to the wrong login.
      </>
    ),
  },
  {
    title: "Move a project to the account with room when one runs low",
    body: (
      <>
        Your main login is at 96% of its weekly limit and resets in two days.
        Open the project&rsquo;s menu in the sidebar: under Claude account,
        every account shows its 5-hour and weekly usage and when it resets.
        Pick the one with room and the next Claude session in that project
        runs on it, while the sessions already open finish on the old one.
      </>
    ),
  },
  {
    title: "Keep client work billable to the client's seat",
    body: (
      <>
        Freelancing across two clients, each providing their own Claude seat?
        Pin each client&rsquo;s repo to that client&rsquo;s account. Every
        terminal session, every AI-generated commit message and PR description
        in that repo runs on the seat they pay for, without ever
        re-authenticating mid-day.
      </>
    ),
  },
];

export default function Workflows() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="In practice"
          title="Four ways per-project Claude accounts pay off"
          description="Concrete setups where pinning beats switching."
        />

        <div className="space-y-12">
          {WORKFLOWS.map((workflow, i) => (
            <div key={workflow.title} className="relative pl-10">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs font-bold text-white dark:text-gray-900">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold mb-1.5">{workflow.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {workflow.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
