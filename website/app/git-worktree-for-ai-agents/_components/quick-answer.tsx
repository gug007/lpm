import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/config/code-block";

export default function QuickAnswer() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.025]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            The short answer
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            How do you run multiple AI coding agents on one repository?
          </h2>
          <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            <p>
              Give every agent its own directory. A{" "}
              <a
                href="https://git-scm.com/docs/git-worktree"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
              >
                Git worktree
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>{" "}
              is the cheapest way to do it: a second working directory on its
              own branch, backed by the same repository history.
            </p>
          </div>

          <div className="mt-6">
            <CodeBlock filename="One worktree per agent">
              git worktree add ../app-auth -b auth
              {"\n"}cd ../app-auth
              {"\n"}claude
            </CodeBlock>
          </div>

          <div className="mt-2 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            <p>
              Claude Code and the Codex app now do this for you —{" "}
              <code className="rounded bg-gray-200/70 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-white/[0.07] dark:text-gray-200">
                claude --worktree
              </code>{" "}
              creates, enters, and cleans up a worktree per session. The part
              nobody automates for you is everything the checkout does not
              contain: your <code className="font-mono">.env</code>, your
              installed dependencies, your uncommitted work, and the ports and
              databases all the agents still share.
            </p>
            <p>
              That gap is why a second primitive exists. lpm creates worktrees
              too, and lpm Duplicate can instead copy the project exactly as it
              sits on your disk into a standalone project with its own Git
              repository — then start the agent in each one.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
