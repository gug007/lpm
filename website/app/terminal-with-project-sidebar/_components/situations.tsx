import { Building2, Server, Undo2 } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const SITUATIONS = [
  {
    icon: Undo2,
    title: "Coming back from an interruption",
    lead: "A hotfix, a review, a question in Slack.",
    body: "You leave a project mid-command and return twenty minutes later. Because the project you were on stays mounted while you are away, its terminals are still running, the scrollback is still there, and the command you had half-typed is still at the prompt. What you rebuild is your train of thought, not your workspace.",
  },
  {
    icon: Building2,
    title: "Keeping clients and side projects apart",
    lead: "Two clients, an internal tool, and the thing you build at night.",
    body: "Put each context in its own folder so the client work is one collapsible group and everything else stays out of view. Rows keep their order, so the project you reach for lands in the same place tomorrow — and a duplicate you made for a risky refactor sits directly under the project it came from instead of drifting to the bottom of a tab row.",
  },
  {
    icon: Server,
    title: "Local, remote, and agent-driven work at once",
    lead: "A local stack, an SSH box, and Claude Code running somewhere in between.",
    body: "SSH projects sit in the same list as local ones, and a paired Mac gets its own section, so remote work is not a separate app to alt-tab into. When Claude Code or Codex needs an answer, the row it is working in turns amber — you find out from the sidebar instead of by checking each terminal in turn.",
  },
];

export default function Situations() {
  return (
    <section className="border-y border-gray-100 bg-gray-50/60 py-20 sm:py-24 dark:border-gray-800/60 dark:bg-white/[0.015]">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Where it earns its place"
          title="Three situations the model actually helps with"
          className="mb-12"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {SITUATIONS.map(({ icon: Icon, title, lead, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <Icon
                className="h-5 w-5 text-gray-500 dark:text-gray-400"
                aria-hidden
              />
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="mt-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                {lead}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            When it will not help
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            If you keep one shell open, or three or four tabs you can name from
            memory, a project sidebar is overhead you do not need — Terminal or
            iTerm2 already fits that shape, and switching costs you more than
            you get back. The model starts paying off when the tab row has
            stopped being scannable: several projects in flight, sessions you
            did not open today, or agents running in copies of the same repo.
          </p>
        </div>
      </div>
    </section>
  );
}
