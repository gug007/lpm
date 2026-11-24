import { Bot, CircleX, Zap, type LucideIcon } from "lucide-react";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const EVENTS: { icon: LucideIcon; title: string; example: string; body: string }[] = [
  {
    icon: CircleX,
    title: "CI fails",
    example: "When CI fails on main",
    body: "A commit you pushed from this computer fails its checks. Name branches to narrow it. It needs the GitHub CLI signed in.",
  },
  {
    icon: Zap,
    title: "A service crashes",
    example: "When api crashes",
    body: "One of the project's services exits with an error code. lpm notices within a minute. Name services to narrow it.",
  },
  {
    icon: Bot,
    title: "An agent finishes",
    example: "When an agent finishes",
    body: "An agent in a terminal ends its turn, in this project or in others you name.",
  },
];

export default function Events() {
  return (
    <section className="py-16 sm:py-20 border-y border-gray-200 bg-gray-50/60 dark:border-gray-800/60 dark:bg-white/[0.015]">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Events"
          title="Or when something happens"
          description="Switch a job's When from Simple to Event and lpm starts it on what it sees, instead of on the clock."
          className="mb-12"
        />
        <ul className="grid gap-4 sm:grid-cols-3">
          {EVENTS.map(({ icon: Icon, title, example, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
                {title}
              </span>
              <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-1.5 font-mono text-[12px] text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-white/[0.06]">
                {example}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-10 max-w-3xl">
          <CodeBlock filename="Fix CI in a fresh worktree">
            <Comment># Runs once for each failing commit on main</Comment>
            {"\n"}lpm automations add fix-ci --label &quot;Fix CI&quot; \
            {"\n  "}--on ciFailed --branches main --duplicate worktree \
            {"\n  "}--agent claude \
            {"\n  "}--prompt &quot;Make the failing checks pass and push the fix.&quot;
          </CodeBlock>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            The run is told what happened. It reacts once per commit, or once a
            day. A CI job stops after three runs in a row on a branch until CI
            passes there. When an agent finishes, a job can run a prompt or a
            command, not an action: that action&apos;s own agent would finish
            and start it again.
          </p>
        </div>
      </div>
    </section>
  );
}
