import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Does Claude Code support Git worktrees?",
    answer:
      "Yes. Pass --worktree or -w with a name and Claude Code creates the worktree, starts the session in it, and offers to remove it when you exit. Worktrees are created under .claude/worktrees/<name>/ on a branch named worktree-<name>, and subagents can be pinned to their own worktree with isolation: worktree in their frontmatter.",
  },
  {
    question: "Does a Git worktree copy files like .env or node_modules?",
    answer:
      "No. git worktree add checks out tracked files from the commit you point it at. Anything ignored by Git — .env files, node_modules, virtualenvs, local certificates — is absent from a new worktree. Claude Code can copy selected ignored files into the worktrees it creates if you add a .worktreeinclude file, and lpm Duplicate carries them because it copies the project folder instead of checking one out.",
  },
  {
    question: "How do I run multiple Claude Code sessions at once?",
    answer:
      "Give each session its own directory so the agents cannot overwrite each other's edits, then start Claude in each one. That directory can be a Git worktree, a standalone copy of the project, or a container. Running several sessions costs nothing extra on your plan; the practical limit is how many diffs you can review.",
  },
  {
    question: "Can two Git worktrees check out the same branch?",
    answer:
      "No. Git refuses with 'fatal: <branch> is already checked out at <path>', because a commit in one worktree would leave the other pointing at a stale state of the same branch. If you want several agents to attempt the same branch and then keep the best result, each one needs an independent repository rather than a linked worktree.",
  },
  {
    question: "Does Codex support parallel agents and worktrees?",
    answer:
      "Yes. The Codex app runs agents in parallel threads and can back a thread with a Git worktree, created under $CODEX_HOME/worktrees/ so your main checkout stays untouched. As with Claude Code, the isolation covers the checkout, not the environment around it.",
  },
  {
    question: "Do Git worktrees isolate ports, databases, or Docker volumes?",
    answer:
      "No, and lpm does not isolate them yet either. Every model on this page draws its boundary at the filesystem, so two agents in two worktrees will still fight over port 3000 and still run migrations against the same database. lpm checks declared ports before a project starts and tells you which process is holding one, so the collision surfaces immediately instead of halfway through a run, and per-copy port assignment is what we are building next. Until then, isolating runtime state needs per-copy configuration, separate services, or containers.",
  },
  {
    question: "Can I use Git worktrees with GitHub Copilot, Gemini CLI, or OpenCode?",
    answer:
      "Yes. Worktrees are a Git feature, so any terminal agent runs inside one. What differs is whether the agent creates and cleans up the directory for you. Claude Code and Codex do; for the others you run git worktree add yourself, or use a tool that does the batch for you.",
  },
  {
    question: "Is there a Git worktree MCP server or agent skill?",
    answer:
      "lpm installs skills for Claude Code and Codex that teach the agent its own CLI, including lpm worktree and lpm duplicate. An agent can then create its own isolated copies, queue work in them, wait for the others to settle, and remove them — without you translating each step into shell commands.",
  },
  {
    question: "What is the difference between lpm worktree and lpm duplicate?",
    answer:
      "lpm worktree creates real linked Git worktrees on an lpm/<name> branch, sharing your repository. lpm duplicate creates a standalone folder with its own .git directory, starting from the project exactly as it is on disk. Both create up to 50 at a time, inherit the project's services and actions, and can queue an agent command with a prompt on each one.",
  },
  {
    question: "Does lpm worktree copy my .env file and dependencies?",
    answer:
      "No. lpm worktree runs a real git worktree add, so it has the same blind spot as raw Git: ignored files are not carried over. You can pass --reinstall-deps to install dependencies in each worktree. If the copy needs your local files and current state, use lpm duplicate instead.",
  },
  {
    question: "How much disk does each copy use?",
    answer:
      "A linked worktree is very compact because the repository data is shared. lpm Duplicate starts with an APFS copy-on-write clone, so unchanged file data is shared by the filesystem at first and storage grows as the copies diverge. Regenerable build caches such as .next, dist, and target are skipped rather than cloned.",
  },
  {
    question: "How many parallel agents should I run?",
    answer:
      "Fewer than you can create. Spinning up five agents takes one command; reviewing five diffs and landing five branches does not scale the same way. Most developers settle around three to five concurrent sessions, and the bottleneck is review, not isolation.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Git worktrees and AI agents, answered"
        />
        <ul className="space-y-3">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden dark:text-gray-100">
                  <span>{question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180 dark:text-gray-500"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
