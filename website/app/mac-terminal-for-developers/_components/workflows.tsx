import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { CONNECT_AGENTS_PATH, PROJECT_SIDEBAR_PATH } from "@/lib/links";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const CODE = "text-xs";

const WORKFLOWS: Workflow[] = [
  {
    title: "Spin up an unfamiliar repo your first morning on a project",
    body: (
      <>
        Choose Clone Repository in Add a project, paste the URL, and lpm clones
        it and sets up services from its manifests. Check them in the Start menu, edit one
        if you need to, and hit Start. Every service streams side by side, with
        no guessing from the README.
      </>
    ),
  },
  {
    title: "Run your full stack while debugging a specific service",
    body: (
      <>
        Open a shell pane next to your service panes and add debug logging.
        Then stop that one service from its tab and start it again from the
        Start menu, or run <code className={CODE}>lpm service api restart</code>
        {", "}while the rest of the stack stays up. No need to tear down the
        whole environment to test one change.
      </>
    ),
  },
  {
    title: "Juggle three client projects in the same afternoon",
    body: (
      <>
        Each client project gets{" "}
        <Link
          href={PROJECT_SIDEBAR_PATH}
          className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
        >
          its own row in the project sidebar
        </Link>
        . Leave project A running, open project B, make changes, and jump to
        project C for a quick hotfix. All three keep their running state,
        their service logs, and their terminal history. Each service starts in
        its own folder through your login shell, so your version manager picks
        the right Node for each project.
      </>
    ),
  },
  {
    title: "Script the stack from any terminal",
    body: (
      <>
        The lpm command line drives the same projects as the app.{" "}
        <code className={CODE}>lpm start myapp --profile backend</code>{" "}
        brings up part of the stack, <code className={CODE}>lpm wait --port 3000</code>{" "}
        holds a script until the server listens, and{" "}
        <code className={CODE}>lpm logs api -n 200</code>{" "}
        grabs the latest stack trace. Commands speak <code className={CODE}>--json</code>
        {", "}and{" "}
        <Link
          href={CONNECT_AGENTS_PATH}
          className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
        >
          AI agents can use it too
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
          title="Four full-stack days lpm makes shorter"
          description="Everyday scenarios that drag with scattered tabs and stay quick in a workspace that knows your stack."
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
