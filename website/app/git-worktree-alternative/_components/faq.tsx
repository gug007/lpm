import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Is lpm Duplicate based on Git worktree?",
    answer:
      "No. A Git worktree is linked to a shared repository. lpm Duplicate makes a standalone copy of the project folder with its own .git directory, then removes any stale worktree registrations copied from the source.",
  },
  {
    question: "Why use lpm Duplicate instead of Git worktree?",
    answer:
      "Use lpm Duplicate when the agent needs the project as it exists locally, not only tracked files from a commit. It can preserve uncommitted changes, local ignored files, and installed dependencies, inherit the lpm project setup, and queue an agent task in the same flow.",
  },
  {
    question: "Does lpm Duplicate copy uncommitted changes?",
    answer:
      "Yes, by default. You can instead enable the clean-copy option to reset tracked changes and remove untracked files. You can also pull the latest upstream commit or reinstall dependencies for each copy.",
  },
  {
    question: "Does every duplicate have its own Git repository?",
    answer:
      "Yes. Every copy has an independent .git directory, so its branch, index, config, and Git operations do not depend on the source project. Commits are not automatically shared back to the original copy.",
  },
  {
    question: "How much disk space does an lpm Duplicate use?",
    answer:
      "On APFS, lpm starts with a fast copy-on-write clone, so unchanged file data is shared by the filesystem at first. Storage grows as copies diverge. lpm skips regenerable build caches and can omit and reinstall dependencies when you want a cleaner copy.",
  },
  {
    question: "Can lpm run Claude Code or Codex in every copy automatically?",
    answer:
      "Yes. The Duplicate dialog and lpm CLI can create up to 50 copies and queue a configured action or any command with a prompt on each one. The same workflow works with Claude Code, Codex, Gemini CLI, OpenCode, and other terminal-based agents.",
  },
  {
    question: "When is Git worktree still the better choice?",
    answer:
      "Choose Git worktree when you want a lightweight additional checkout, prefer shared Git refs and object storage, and already have a reliable way to initialize local files, dependencies, services, and agent sessions for every worktree.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Git worktree and lpm Duplicate questions"
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
