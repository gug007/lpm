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
      "No. git worktree add checks out tracked files from the commit you point it at. Anything ignored by Git — .env files, node_modules, virtualenvs, local certificates — is absent from a new worktree. Claude Code and Codex can copy selected ignored files into the worktrees they create if you add a .worktreeinclude file, and lpm Duplicate carries them because it copies the project folder instead of checking one out.",
  },
  {
    question: "Should every Claude Code session get its own worktree?",
    answer:
      "Only if two sessions could touch the same files. A worktree hands each session a separate checkout on its own branch, so their edits cannot collide; sessions working in unrelated parts of the repo can share one checkout. Whatever directory you pick — a worktree, a standalone copy or a container — sessions on one Claude account still share its plan limits, so the ceiling is usually how many diffs you can review.",
  },
  {
    question: "Can two Git worktrees check out the same branch?",
    answer:
      "No. Git refuses with 'fatal: <branch> is already checked out at <path>', because a commit in one worktree would leave the other pointing at a stale state of the same branch. If you want several agents to attempt the same branch and then keep the best result, each one needs an independent repository rather than a linked worktree.",
  },
  {
    question: "Does Codex support parallel agents and worktrees?",
    answer:
      "Yes. Codex in the ChatGPT desktop app can run each chat in its own Git worktree, created under $CODEX_HOME/worktrees/ in a detached HEAD state, so several chats work in parallel and your main checkout stays untouched. It can copy files listed in .worktreeinclude and run a setup script in each worktree, but as with Claude Code, ports and databases are still shared.",
  },
  {
    question: "Do Git worktrees isolate ports, databases, or Docker volumes?",
    answer:
      "No, and lpm does not isolate them either. Every model on this page draws its boundary at the filesystem, so two agents in two worktrees will still fight over port 3000 and still run migrations against the same database. lpm checks declared ports before a project starts and tells you which process is holding one, so the collision surfaces immediately instead of halfway through a run. Isolating runtime state needs per-copy configuration, separate services, or containers.",
  },
  {
    question: "Can I use Git worktrees with GitHub Copilot, Gemini CLI, or OpenCode?",
    answer:
      "Yes. Worktrees are a Git feature, so any terminal agent runs inside one. What differs is whether the agent creates and cleans up the directory for you. Claude Code and Codex do; for the others you run git worktree add yourself, or use a tool that does the batch for you.",
  },
  {
    question: "Is there a Git worktree MCP server or agent skill?",
    answer:
      "lpm installs skills for Claude Code, Codex, Gemini CLI, and OpenCode that teach the agent how to drive lpm directly. An agent can then create its own isolated worktrees or copies, run work in them, wait for the others to settle, and remove them, without you translating each step yourself.",
  },
  {
    question: "What is the difference between lpm Worktree and lpm Duplicate?",
    answer:
      "They are separate items in a project's right-click menu. New Worktree creates real linked Git worktrees, each on a new branch from your current commit, sharing your repository. Duplicate creates standalone folders with their own Git repository, starting from the project exactly as it is on disk. Both create up to 50 at a time, inherit the project's services, actions, and pinned Claude account, and can queue an action or command with a prompt on each one.",
  },
  {
    question: "Does lpm Worktree copy my .env file and dependencies?",
    answer:
      "No. lpm Worktree creates a real Git worktree, so it has the same blind spot as raw Git: uncommitted and ignored files are not carried over. Tick Install dependencies to install them fresh in each worktree. If the copy needs your local files and current state, use lpm Duplicate instead.",
  },
  {
    question: "What happens when I delete an lpm worktree or copy?",
    answer:
      "lpm deletes the folder outright and skips the Trash, and removing a worktree also force-deletes its branch, so push or merge anything worth keeping first.",
  },
  {
    question: "How much disk does each copy use?",
    answer:
      "A linked worktree is very compact because the repository data is shared. A Duplicate begins as an APFS clone whose unchanged blocks stay shared on disk, and it only grows as each copy changes. Regenerable build caches such as .next, dist, and target are skipped rather than cloned.",
  },
  {
    question: "How many parallel agents should I run?",
    answer:
      "Fewer than you can create. Spinning up five agents takes one command; reviewing five diffs and landing five branches does not scale the same way, and every session draws on the same plan limits. The bottleneck is usually review, not isolation.",
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
                    className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400"
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
