import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Spin up an unfamiliar repo your first morning on a project",
    body: (
      <>
        Clone the repo, open it in lpm. The auto-detection pass reads your{" "}
        <code className="text-xs">package.json</code>,{" "}
        <code className="text-xs">Procfile</code>,{" "}
        <code className="text-xs">docker-compose.yml</code>, or{" "}
        <code className="text-xs">manage.py</code> and proposes a service
        config. Review it, tweak the ports, hit Start. Every service streams
        live side by side — no README guessing, no missing env vars surfaced at
        runtime.
      </>
    ),
  },
  {
    title: "Run your full stack while debugging a specific service",
    body: (
      <>
        Open a shell pane next to your service panes. Set a breakpoint or add
        debug logging, restart just that one service from its pane controls, and
        watch its isolated log while the rest of the stack stays up. No need to
        tear down and rebuild the whole environment to test one change.
      </>
    ),
  },
  {
    title: "Juggle three client projects in the same afternoon",
    body: (
      <>
        Each client project has its own sidebar entry. Pause project A, open
        project B, make changes, context-switch to project C for a quick
        hotfix. All three keep their running state, their service logs, and
        their terminal history. No re-cloning, no{" "}
        <code className="text-xs">nvm use</code>, no &ldquo;which version of
        Node does this one need?&rdquo; — lpm handles it per-project.
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
          title="Three developer workflows your Mac terminal should make effortless"
          description="Real scenarios that take 30+ minutes with scattered tabs and under 5 with a proper dev workspace."
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
