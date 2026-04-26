import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Rebase a feature branch without stopping your local stack",
    body: (
      <>
        You have an API, a worker, and a Next.js dev server running. A PR review
        comes back: rebase onto main before merge. Open a shell pane next to
        your service panes, run{" "}
        <code className="text-xs">git fetch && git rebase origin/main</code>,
        resolve any conflicts, and push. The services never stopped. The log
        panes kept streaming the whole time. You close the shell pane and keep
        developing.
      </>
    ),
  },
  {
    title: "Review and merge a colleague's PR without losing your branch",
    body: (
      <>
        Your team lead asks for a quick review on a branch you haven&rsquo;t
        touched. Open a second project workspace pointing at the same repo,{" "}
        <code className="text-xs">git checkout</code> the review branch, start
        just the services you need to test the change, leave a comment, merge,
        and switch back to your workspace. Your original branch, its running
        services, and your open shell sessions are all still there.
      </>
    ),
  },
  {
    title: "Ship a hotfix from the same terminal you develop in",
    body: (
      <>
        Production is down. You{" "}
        <code className="text-xs">git stash</code>,{" "}
        <code className="text-xs">git checkout main</code>,{" "}
        <code className="text-xs">git pull</code>, fix the issue, run the test
        suite in a shell pane while your local API keeps running in its pane,
        push, tag, and deploy — never leaving lpm. No &ldquo;where&rsquo;s my
        terminal that has production credentials loaded&rdquo; hunting. It&rsquo;s
        the same shell, same project, same window.
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
          title="Git workflows your Mac terminal should actually support"
          description="Three scenarios where a split between your git tool and your terminal costs real time — and how lpm collapses them into one window."
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
