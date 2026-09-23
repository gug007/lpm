import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { AUTOMATIONS_PATH } from "@/lib/links";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Claude Code on a feature branch, Codex writing tests",
    body: (
      <>
        Select your project in the sidebar and click Start: the full stack
        boots in one window, one service per tab. Point Claude Code at it for
        the feature work. For the second agent, choose New Worktree from the
        project&rsquo;s menu. You get a real Git checkout on its own branch,
        with its own services, listed right under the original. Point Codex at
        that. If both copies run a dev server on the same port, lpm catches
        the clash when you press Start and offers to free the port. To run both
        at once, point the copy&rsquo;s dev server at another port, for example
        with a PORT variable in its start command.
      </>
    ),
  },
  {
    title: "Switch branches without a stale dev server",
    body: (
      <>
        Agents get confused when the server on port 3000 is still running the
        code from the branch they just left. Click Stop in the project&rsquo;s
        header and every service shuts down, child processes included. Click
        Start on the new checkout and the whole stack comes back fresh in the
        same window, so when Claude Code returns it sees the code it actually
        expects.
      </>
    ),
  },
  {
    title: "Give the agent only the services it should see",
    body: (
      <>
        You don&rsquo;t need the Next.js frontend running while an agent is
        refactoring a Go API. Open the Start menu in the project header and
        pick a profile that starts only the API and its database. The agent
        works against a smaller, quieter stack, and you can still switch a
        single service on or off from the same menu.
      </>
    ),
  },
  {
    title: "Hand the overnight chores to a schedule",
    body: (
      <>
        Some prompts should run every morning, not when you remember them:
        triage new issues, bump dependencies, rerun a flaky suite. Save one
        as an automation and lpm runs it with Claude Code or Codex on your
        schedule, in the project or in a fresh copy, while the app is open
        and the Mac is awake. See how to{" "}
        <Link
          href={AUTOMATIONS_PATH}
          className="font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          schedule Claude Code tasks
        </Link>
        .
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
