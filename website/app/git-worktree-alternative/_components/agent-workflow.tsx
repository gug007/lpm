import { Bot, Command, FolderGit2 } from "lucide-react";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const OUTCOMES = [
  {
    icon: FolderGit2,
    title: "Three independent repositories",
    body: "Every agent can branch, commit, reset, or experiment without sharing Git administrative state with the others.",
  },
  {
    icon: Bot,
    title: "One prompt, parallel attempts",
    body: "Queue the same task in every copy, compare the results, then keep the strongest implementation.",
  },
  {
    icon: Command,
    title: "Agent-friendly lifecycle",
    body: "Wait on completion, inspect changes, and remove disposable copies with explicit lpm commands.",
  },
];

export default function AgentWorkflow() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Parallel Claude Code and Codex"
          title="One command instead of a worktree setup script"
          description="The desktop flow is visual. The same Duplicate primitive is available to you and your coding agents through the lpm CLI."
        />

        <CodeBlock filename="Fan out one task">
          lpm duplicate myapp -n 3 --run claude \
          {"\n"}  --prompt &quot;Find and fix the checkout race condition&quot;
          {"\n\n"}lpm wait --agent -p COPY_NAME
          {"\n"}lpm remove COPY_NAME
        </CodeBlock>

        <div className="mt-10 space-y-5">
          {OUTCOMES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
