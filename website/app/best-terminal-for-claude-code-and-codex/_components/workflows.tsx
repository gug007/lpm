import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Claude Code on a feature branch, Codex writing tests",
    body: (
      <>
        Click Start on your project in the lpm sidebar and the full stack
        boots in one window, one service per tab. Point Claude Code at it to
        drive the feature work, then flip the profile dropdown in the header
        to a lighter test profile and point Codex at that. Two agents, the
        same repo, no fighting over port 3000 — and you can watch both of
        them work by glancing at the live service tabs side by side.
      </>
    ),
  },
  {
    title: "Switch branches without a stale dev server",
    body: (
      <>
        Agents get confused when the server on port 3000 is still running the
        code from the branch they just left. Hit Stop on the project in the
        sidebar and everything shuts down cleanly — no orphaned node
        processes, no stuck migrations. Click Start again on the new checkout
        and the whole stack comes back fresh in the same window, so when
        Claude Code returns it sees the code it actually expects.
      </>
    ),
  },
  {
    title: "Give the agent only the services it should see",
    body: (
      <>
        You don&rsquo;t need the Next.js frontend running while an agent is
        refactoring a Go API. Open the profile switcher in the header and
        pick a profile that only exposes the API and its database — the
        frontend tab drops out, the API keeps running, and the agent works
        against a smaller, quieter stack. Fewer moving parts, less terminal
        noise, and no accidental writes to services the agent was never
        meant to touch.
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
          title="Workflows that used to be painful"
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
