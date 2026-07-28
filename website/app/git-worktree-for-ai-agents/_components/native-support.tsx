import { ExternalLink } from "lucide-react";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

type Agent = {
  name: string;
  status: string;
  body: string;
  code?: string;
  note: string;
  href?: string;
  hrefLabel?: string;
};

const AGENTS: Agent[] = [
  {
    name: "Claude Code",
    status: "Built in",
    body: "Pass --worktree (or -w) with a name and Claude creates the worktree, starts the session inside it, and offers to remove it on exit. Worktrees land under .claude/worktrees/<name>/ on a branch named worktree-<name>. Subagents can get the same treatment with isolation: worktree in their frontmatter.",
    code: 'claude --worktree feature-auth\n\n# copy gitignored files into every new worktree\ncat .worktreeinclude\n.env\n.env.local',
    note: "New worktrees branch from your default branch unless you set worktree.baseRef to head. Anthropic's own documentation is explicit that a worktree is a fresh checkout and you still have to initialize the environment inside it.",
    href: "https://code.claude.com/docs/en/worktrees",
    hrefLabel: "Claude Code worktree documentation",
  },
  {
    name: "Codex",
    status: "Built in",
    body: "The Codex app runs agents in parallel threads, each on its own worktree. Starting a thread on a worktree creates a directory under $CODEX_HOME/worktrees/ and checks out the target branch there, leaving your main checkout untouched.",
    note: "Same boundary as everything else: the checkout is isolated, the environment around it is not.",
    href: "https://developers.openai.com/codex/",
    hrefLabel: "Codex documentation",
  },
  {
    name: "GitHub Copilot, Gemini CLI, OpenCode, and the rest",
    status: "Bring your own",
    body: "Worktrees are a Git feature, not an agent feature, so any terminal agent works inside one. What varies is whether the agent creates and cleans up the directory for you, or whether you script it.",
    code: "git worktree add ../app-copilot -b copilot-task\ncd ../app-copilot\ncp ../app/.env .env\npnpm install\ncopilot",
    note: "This is the loop that agent-specific flags remove — and the loop that stays if the agent you use does not have one.",
  },
];

export default function NativeSupport() {
  return (
    <section id="native" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What the agents already do"
          title="Claude Code and Codex create worktrees for you"
          description="Before adding a tool, check what your agent ships with. For a single session on a clean branch, the built-in flag is usually enough."
          className="mb-12"
        />

        <div className="space-y-6">
          {AGENTS.map((agent) => (
            <article
              key={agent.name}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {agent.name}
                </h3>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {agent.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {agent.body}
              </p>
              {agent.code && (
                <div className="mt-5">
                  <CodeBlock>{agent.code}</CodeBlock>
                </div>
              )}
              <p className="mt-4 border-t border-gray-100 pt-4 text-sm leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-500">
                {agent.note}
                {agent.href && (
                  <>
                    {" "}
                    <a
                      href={agent.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
                    >
                      {agent.hrefLabel}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </>
                )}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
