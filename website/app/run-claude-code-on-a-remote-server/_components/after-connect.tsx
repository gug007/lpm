import Link from "next/link";
import {
  Copy,
  FileUp,
  GitCompare,
  Layers,
  Smartphone,
  SquareTerminal,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH } from "@/lib/links";

const FEATURES = [
  {
    icon: SquareTerminal,
    title: "Terminals and agents, live",
    body: "Start Claude Code or Codex in a terminal on the server and watch it stream on your Mac, keystroke for keystroke. When it finishes or stops to ask you something, your Mac chimes and the tab lights up.",
  },
  {
    icon: Layers,
    title: "Its services, its logs",
    body: (
      <>
        Start and stop the project&rsquo;s services on the server from the same
        buttons you use locally, or restart one with{" "}
        <code className="font-mono text-[0.9em]">lpm service &lt;name&gt; restart</code>,
        and read what they printed. They run there, so they are still up
        tomorrow morning.
      </>
    ),
  },
  {
    icon: GitCompare,
    title: "Review before you believe it",
    body: "Changed files and full diffs for a server project open in the same review pane as a local one. You read what the agent did without SSHing in to look.",
  },
  {
    icon: Copy,
    title: "Fan out on the server's cores",
    body: "Duplicate a server project into copies and queue the same prompt in each. The copying and the running happen on the server — your laptop stays quiet.",
  },
  {
    icon: FileUp,
    title: "Files and new projects",
    body: "Drag a screenshot or a file onto a server terminal and lpm uploads it there and pastes the path. Right-click the server in the sidebar to add a project on it, from a folder or a Git clone.",
  },
  {
    icon: Smartphone,
    title: "Your phone, straight to the server",
    body: (
      <>
        Pair the{" "}
        <Link
          href={MOBILE_PATH}
          className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
        >
          lpm iPhone app
        </Link>{" "}
        with the server itself and check on an agent, or answer it, while your
        Mac is off.
      </>
    ),
  },
];

export default function AfterConnect() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Once it is connected"
          title="A remote project that behaves like a local one"
          description="Everything routes through the same window. The only visible difference is which machine the work is happening on."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-transparent"
            >
              <Icon
                className="h-5 w-5 text-gray-500 dark:text-gray-400"
                aria-hidden
              />
              <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Add as many servers as you like: each gets its own sidebar section,
          status, and version line, with an Update button when it falls behind
          your Mac. Config sync keeps lpm settings, and the config of projects
          that exist on both machines, in step, on demand or automatically.
        </p>
      </div>
    </section>
  );
}
