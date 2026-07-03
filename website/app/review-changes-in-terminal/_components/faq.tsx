import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "How do I review changes in the terminal with lpm?",
    answer:
      "Open a review pane in your project — a diff view lists every changed file with a Modified, Added, or Deleted marker. Click a file to read its diff inline, with added lines highlighted green and removed lines red, and navigate between files with the arrow keys. The review sits in a pane right beside your running services and terminals, so you never leave the window to see what changed.",
  },
  {
    question: "Does lpm replace a git GUI like GitKraken or the GitHub diff view?",
    answer:
      "For reviewing your own changes before you commit, yes. lpm gives you a fast file-by-file diff built into the same workspace as your terminals, services, and AI agents — no browser tab and no second app. It focuses on the read-and-commit loop rather than a full visual branch graph, so if you rely on click-to-cherry-pick GUI features you can still run a git client alongside it, but most developers find the built-in review is all they reach for.",
  },
  {
    question: "Can I review the changes an AI coding agent made?",
    answer:
      "That's one of the main reasons the review pane exists. When Claude Code or Codex edits files in an lpm terminal, open the diff in a pane right beside the agent and read exactly what it changed before you accept anything. You review the agent's work in the same window it's working in, instead of approving edits blindly or switching to a separate diff tool.",
  },
  {
    question: "Do I need to stage or commit my changes first to review them?",
    answer:
      "No. The review shows your working-tree changes — modified, newly added, and deleted files — so you can read the full diff before you decide what to stage or commit. It's the last gate before code leaves your machine, not something that only works after the fact.",
  },
  {
    question: "Is the diff viewer a real native app or a web view?",
    answer:
      "lpm is a native macOS desktop app built for Apple Silicon — no Electron and no bundled browser. The diff renders natively, scrolls smoothly on large files, and responds to keyboard navigation instantly, in the same window as your real terminal panes running your actual shell and dev servers.",
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
                  <ChevronDown className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 group-open:rotate-180" />
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </div>
    </section>
  );
}
