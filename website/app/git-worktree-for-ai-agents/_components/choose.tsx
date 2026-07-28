import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Branch = {
  question: string;
  answer: string;
  why: string;
  highlight?: boolean;
};

const BRANCHES: Branch[] = [
  {
    question: "One agent, one clean branch, and setup is cheap",
    answer: "Your agent's built-in flag",
    why: "claude --worktree or a Codex thread. Nothing to install, and cleanup is handled on exit.",
  },
  {
    question: "Several agents, and your repository needs no local setup",
    answer: "git worktree, or lpm worktree for the batch",
    why: "The checkout is all the agent needs, so the lightest primitive wins. Use lpm worktree when you want several at once with a prompt queued on each.",
  },
  {
    question: "The agent needs your .env, your dependencies, or your uncommitted work",
    answer: "lpm duplicate",
    why: "A checkout cannot reproduce state that was never committed. A copy of the working project can.",
    highlight: true,
  },
  {
    question: "Several agents should attempt the same branch and you keep the best",
    answer: "lpm duplicate",
    why: "Linked worktrees refuse a branch that is already checked out. Independent repositories have no such restriction.",
    highlight: true,
  },
  {
    question: "You are running agents with approvals turned off",
    answer: "A container or a VM",
    why: "None of these models is a security boundary. A separate directory does not contain a command that decides to touch the rest of your machine.",
  },
];

export default function Choose() {
  return (
    <section id="choose" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Pick one"
          title="Which isolation model do you actually need?"
          description="Work down the list and stop at the first line that describes your repository."
          className="mb-12"
        />

        <ul className="space-y-4">
          {BRANCHES.map((branch) => (
            <li
              key={branch.question}
              className={`rounded-2xl border p-5 sm:p-6 ${
                branch.highlight
                  ? "border-emerald-200 bg-emerald-50/35 dark:border-emerald-900/60 dark:bg-emerald-400/[0.035]"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {branch.question}
              </p>
              <p className="mt-2 flex items-start gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                <ArrowRight
                  className={`mt-1 h-4 w-4 shrink-0 ${
                    branch.highlight
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                  aria-hidden
                />
                {branch.answer}
              </p>
              <p className="mt-2 pl-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {branch.why}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
