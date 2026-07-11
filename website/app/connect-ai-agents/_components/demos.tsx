import { SectionHeader } from "@/components/section-header";

type Demo = {
  title: string;
  body: React.ReactNode;
  media: string;
  label: string;
};

const DEMOS: Demo[] = [
  {
    title: "Ask for a command — get it in a new terminal",
    body: (
      <>
        The user asks Claude Code to show the last 10 git commits that touched
        the mobile app code in a new terminal. The agent picks up the lpm skill
        on its own, runs{" "}
        <code className="font-mono text-xs">
          lpm run --command &quot;git log -n 10 --oneline -- apps/native&quot;
        </code>
        , and a fresh terminal tab opens in lpm with the output.
      </>
    ),
    media: "/screenrecording/agent-run-command",
    label:
      "Claude Code using the lpm CLI to run a git log command in a new lpm terminal",
  },
  {
    title: "Spin up three agents in the same project",
    body: (
      <>
        The user asks Claude Code to create three new tabs and run the claude
        action in each with a prompt. The agent drives the lpm CLI, and three
        new Claude tabs appear in the same project — each one already working on
        the prompt.
      </>
    ),
    media: "/screenrecording/agent-parallel-tabs",
    label:
      "Claude Code using the lpm CLI to open three parallel Claude tabs in one project",
  },
  {
    title: "Fan out into three project copies",
    body: (
      <>
        The user asks Claude Code to create three duplicates and run the claude
        action in each. The agent runs{" "}
        <code className="font-mono text-xs">
          lpm duplicate -n 3 --run claude --prompt &quot;…&quot;
        </code>{" "}
        — three grouped copies appear in the sidebar, each with its own Claude
        running, and the agent verifies the result with the CLI.
      </>
    ),
    media: "/screenrecording/agent-duplicate-fanout",
    label:
      "Claude Code duplicating a project into three copies, each running its own Claude agent",
  },
];

export default function Demos() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="See it in action"
          title="Watch an agent drive lpm"
          description="Three real recordings — one prompt each, no per-project setup. Claude Code discovers the lpm CLI and does the rest."
        />

        <div className="space-y-12">
          {DEMOS.map((demo, i) => (
            <div key={demo.title} className="relative pl-10">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs font-bold text-white dark:text-gray-900">
                {i + 1}
              </div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-1.5">{demo.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {demo.body}
                </p>
              </div>
              <video
                src={`${demo.media}.mp4`}
                poster={`${demo.media}-poster.jpg`}
                width={1224}
                height={754}
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                aria-label={demo.label}
                className="w-full h-auto rounded-lg shadow-2xl shadow-gray-200/60 dark:shadow-black/40"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
