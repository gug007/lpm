import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { REPO_URL } from "@/lib/links";

type QA = {
  question: string;
  answer: ReactNode;
  // Plain-text override for JSON-LD when `answer` contains JSX that can't be serialized.
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm work with Claude Code and Codex out of the box?",
    answer:
      "Yes. You point lpm at your project, hit Start in the app, and watch each service stream live output in its own pane. The agent talks to the services the app started.",
  },
  {
    question: "Can I run multiple agents in parallel on the same repo?",
    answer:
      "Yes. Each project gets its own entry in the app sidebar with live panes per service, so Claude Code on one stack and Codex on another sit side by side — every agent's output visible at once, no tab juggling.",
  },
  {
    question: "Do I need Docker to use lpm?",
    answer:
      "No. lpm runs anything that runs in a terminal. If you already use Docker Compose it is auto-detected, but plain Rails, Next.js, Go, Django, or Flask projects work without containers.",
  },
  {
    question: "Is lpm open source?",
    answer: (
      <>
        Yes. The source, issue tracker, and releases live on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>
        . Contributions and bug reports are welcome.
      </>
    ),
    answerText: `Yes. The source, issue tracker, and releases live on GitHub at ${REPO_URL}. Contributions and bug reports are welcome.`,
  },
  {
    question: "Which frameworks does lpm auto-detect?",
    answer:
      "Rails, Next.js, Go, Django, Flask, and Docker Compose are detected out of the box. Anything else still works — if it runs in a terminal, lpm can start it.",
  },
  {
    question: "Is there a CLI, a desktop app, or both?",
    answer:
      "This page is about the native macOS desktop app — tabs, live output per service, and a visual project switcher are the main pitch. A CLI is also available and shares the same config if you want to script things or drive lpm from an agent.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer, answerText }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: typeof answer === "string" ? answer : answerText ?? "",
    },
  })),
};

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions developers ask before switching"
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
