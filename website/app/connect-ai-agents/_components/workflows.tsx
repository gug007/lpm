import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "It breaks the API, reads the logs, and fixes itself",
    body: (
      <>
        An agent edits a route and the API starts throwing 500s. Instead of
        stopping to ask you, it runs{" "}
        <code className="font-mono text-xs">lpm logs api -n 200</code>, reads the
        stack trace it just caused, patches the bug, and calls{" "}
        <code className="font-mono text-xs">lpm service api restart</code>. Then{" "}
        <code className="font-mono text-xs">lpm wait --port 8000</code> blocks
        until the server answers again — so the next step never runs against a
        dead service.
      </>
    ),
  },
  {
    title: "It waits for readiness instead of guessing",
    body: (
      <>
        After a fresh <code className="font-mono text-xs">lpm start</code>, the
        skill tells the agent to run{" "}
        <code className="font-mono text-xs">lpm wait --service frontend</code>{" "}
        rather than sleeping for an arbitrary number of seconds. It moves on the
        instant the dev server is up, and never wastes a turn checking a port
        that was never going to be ready yet.
      </>
    ),
  },
  {
    title: "You always know what it is doing",
    body: (
      <>
        Every agent shows a live badge in lpm — Running, Waiting, Done, or
        Error. When it needs your permission or input, the Waiting badge stays
        until you click the tab, so nothing gets lost in a wall of terminals.
        Agents post their own progress with{" "}
        <code className="font-mono text-xs">lpm set-status</code>, and you read
        it all at a glance.
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
          title="A self-healing loop, without you in it"
          description="What changes when the agent can see and control the same services you can."
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
