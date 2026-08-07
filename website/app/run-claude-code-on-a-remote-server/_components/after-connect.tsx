import {
  Copy,
  GitCompare,
  Layers,
  RefreshCw,
  SquareTerminal,
  Waypoints,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const FEATURES = [
  {
    icon: SquareTerminal,
    title: "Terminals and agents, live",
    body: "Start Claude Code or Codex in a terminal on the server and watch it stream on your Mac, keystroke for keystroke. When it stops to ask you something, the tab lights up here.",
  },
  {
    icon: Layers,
    title: "Its services, its logs",
    body: "Start, stop and restart the project's services on the server from the same buttons you use locally, and read what they printed. They run there, so they are still up tomorrow morning.",
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
    icon: RefreshCw,
    title: "Config that follows",
    body: "Keep projects, settings and global config mirrored between your Mac and the server, on demand or automatically, so a project you set up once behaves the same in both places.",
  },
  {
    icon: Waypoints,
    title: "More than one machine",
    body: "Add several servers. Each gets its own section in the sidebar, its own status, and its own version line — and the row tells you when one has fallen behind your Mac.",
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
      </div>
    </section>
  );
}
