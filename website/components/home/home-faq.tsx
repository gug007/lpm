import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question: "Is lpm free?",
    answer:
      "Yes. lpm is free and open source. Download it from lpm.cx, browse the source on GitHub — there is no paid tier and no account required.",
  },
  {
    question: "Which Macs and macOS versions are supported?",
    answer:
      "lpm runs on macOS 12 or later, with separate native builds for Apple Silicon and Intel Macs. Both builds are signed with an Apple-issued Developer ID and notarized by Apple, and there is no Electron runtime.",
  },
  {
    question: "Does lpm replace my terminal or editor?",
    answer:
      "No. lpm works alongside the tools you already use. It manages your projects, services, and agent terminals, and a one-click open-in-editor button takes any project straight to your editor of choice.",
  },
  {
    question: "Does lpm work with my AI coding agent?",
    answer:
      "Yes. lpm has built-in launchers with a model picker for Claude Code, Codex, Gemini, and OpenCode, and you can configure any other command-line agent or script as a one-click button.",
  },
  {
    question: "Does lpm collect my code or telemetry?",
    answer:
      "No. The desktop app runs entirely on your machine — no analytics, no telemetry, no account, and nothing is sent to any server we control. Only this website uses basic visitor analytics; see the privacy policy for details.",
  },
  {
    question: "How do I uninstall lpm?",
    answer:
      "Quit lpm and move lpm.app from Applications to Trash. If you installed the optional command-line link, remove /usr/local/bin/lpm. Delete ~/.lpm only if you also want to erase local settings, project configuration, and notes.",
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

export function HomeFaq() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions developers ask before downloading"
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
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd) }}
        />
      </div>
    </section>
  );
}
