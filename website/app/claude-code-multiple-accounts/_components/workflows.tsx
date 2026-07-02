import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Company seat and personal subscription on one Mac",
    body: (
      <>
        In Settings you add an account called{" "}
        <code className="text-xs">Work</code>. In the client repo&rsquo;s
        config you pick it from the &ldquo;Claude account&rdquo; dropdown. The
        next terminal you open there asks you to sign in with the company
        account — once. Your side project keeps your personal login untouched.
        Now both agents run at the same time in adjacent panes, each spending
        its own subscription&rsquo;s usage, and switching projects in the
        sidebar is the only &ldquo;account switching&rdquo; you ever do.
      </>
    ),
  },
  {
    title: "Duplicate a project ×5 to fan out agents — copies keep the account",
    body: (
      <>
        lpm&rsquo;s duplicate flow exists to spawn throwaway copies of a
        project and run agents on each in parallel. Duplicates inherit the
        parent&rsquo;s pinned account automatically, so five copies of the work
        repo all run as the work identity — no per-copy setup, and no agent
        quietly burning your personal quota because a fresh copy fell back to
        the wrong login.
      </>
    ),
  },
  {
    title: "Keep client work billable to the client's seat",
    body: (
      <>
        Freelancing across two clients, each providing their own Claude seat?
        Pin each client&rsquo;s repo to that client&rsquo;s account. Every
        agent session, every AI-generated commit message and PR description in
        that repo runs on the seat they pay for — clean separation you can
        stand behind, without ever re-authenticating mid-day.
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
          title="Three ways per-project Claude accounts pay off"
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
