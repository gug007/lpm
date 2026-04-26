import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: ReactNode;
  // Plain-text override for JSON-LD when `answer` contains JSX that can't be serialized.
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question:
      "Is lpm the best terminal for Mac on Apple Silicon (M1, M2, M3, M4)?",
    answer:
      "Yes. lpm ships as a universal macOS binary that runs natively on every Apple Silicon chip from M1 to M4, and on Intel Macs too. There is no Rosetta layer, no Electron runtime, and no Chromium tax — it behaves like a first-class Mac app and respects your battery.",
  },
  {
    question: "Is lpm a free terminal for Mac?",
    answer:
      "Yes. lpm is free to download from lpm.cx and the source is public on GitHub. There is no paid tier gating the terminal, the project switcher, or the dev stack features.",
  },
  {
    question: "Is lpm a good git terminal for Mac?",
    answer:
      "Yes. lpm panes are real macOS terminals running your shell of choice — zsh, bash, or fish — so every git command, alias, and dotfile works exactly as it does in Terminal.app or iTerm2. You can run git in one pane and your dev servers in another inside the same native window.",
  },
  {
    question: "Is lpm a good iTerm2 alternative on Mac?",
    answer:
      "If you picked iTerm2 for tabs and split panes, lpm gives you those plus a visual project sidebar, a one-click full-stack start, and live output per service. If you only need a raw terminal with no project awareness, iTerm2 is still a fine choice — lpm is the step up for developers juggling multiple services and projects.",
  },
  {
    question: "How do I download lpm for macOS?",
    answer:
      "Go to lpm.cx, download the .dmg, open it, and drag lpm to your Applications folder. The app supports macOS 12 and later on both Apple Silicon and Intel Macs. On first launch, point it at any project folder and lpm will auto-detect its services.",
  },
  {
    question: "Is lpm a good terminal for beginners on Mac?",
    answer:
      "Yes. Beginners get a visual sidebar, one-click Start and Stop buttons, and auto-detected services for common frameworks like Rails, Next.js, Django, and Flask. You never have to memorize which command starts which server — lpm surfaces them as labelled buttons while still giving you a full macOS terminal underneath when you want one.",
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
          title="What Mac developers ask before switching terminals"
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
