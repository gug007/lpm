import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "How do I review changes in the terminal with lpm?",
    answer:
      "Press ⌘⇧R in a project. Every uncommitted change appears as one scrolling stack of diffs beside a tree of the changed files, each marked modified, added, deleted, renamed, or untracked, with added lines in green and removed lines in red. Switch between split and unified layouts, or open the Files tab's Changes view to step through files one at a time. The review sits in a pane beside your running services and terminals, so you never leave the window to see what changed.",
  },
  {
    question: "Does lpm replace a git GUI like GitKraken or the GitHub diff view?",
    answer:
      "For reviewing your own changes before you commit, often yes. lpm gives you a file-by-file diff, a Commit dialog, and Create PR in the same workspace as your terminals, services, and AI agents, with no browser tab and no second app. It focuses on the read-and-commit loop: there is no branch graph, no hunk-by-hunk staging, and no review comments, so keep a git client or GitHub around for those.",
  },
  {
    question: "Can I review the changes an AI coding agent made?",
    answer:
      "That's one of the main reasons the review pane exists. When Claude Code or Codex edits files in an lpm terminal, open the diff in a pane right beside the agent and read exactly what it changed before you accept anything. You review the agent's work in the same window it's working in, instead of approving edits blindly or switching to a separate diff tool.",
  },
  {
    question: "Do I need to stage or commit my changes first to review them?",
    answer:
      "No. The review shows your working-tree changes compared with the last commit, so you can read the full diff before you decide what to commit. The Commit dialog then commits exactly the files you tick, whole files at a time.",
  },
  {
    question: "Can lpm write the commit message for me?",
    answer:
      "Yes. In the Commit dialog, Generate with AI hands the selected files to whichever coding agent you use (Claude Code, Codex, Gemini CLI, or OpenCode) and it returns a conventional-commit message. No model runs on lpm's side; the agent uses your own sign-in, and you can add style instructions of your own.",
  },
  {
    question: "Can I review changes from my iPhone?",
    answer:
      "Yes, with the lpm Link iPhone app paired to your Mac. It shows every changed file's diff with syntax highlighting, lets you mark files as viewed, and can commit the selected files or create a pull request, while the git work itself runs on your Mac.",
  },
  {
    question: "Is the diff viewer part of the Mac app or a browser page?",
    answer:
      "The diff viewer is built into lpm's macOS desktop app alongside your terminal panes. lpm uses the macOS system webview for its interface instead of bundling Electron or Chromium, so the review stays in the same app window rather than opening a separate browser page.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="What developers ask about reviewing changes in the terminal"
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200 open:border-gray-300 dark:open:border-gray-700 open:bg-gray-50/50 dark:open:bg-white/[0.02]">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd) }}
        />
      </div>
    </section>
  );
}
