import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";
import { vsPath } from "@/lib/links";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm run natively on Apple silicon Macs?",
    answer:
      "Yes. lpm provides separate native downloads for Apple silicon and Intel Macs, so the Apple silicon build does not require Rosetta. The app uses the macOS system webview rather than bundling Electron or Chromium.",
  },
  {
    question: "Is lpm a free terminal for Mac?",
    answer:
      "Yes. lpm is free to download from lpm.cx and the source is public on GitHub. There is no paid tier gating the terminal, the project switcher, or the dev stack features.",
  },
  {
    question: "Is lpm a good git terminal for Mac?",
    answer:
      "Yes, and the output looks the way you expect it to. Panes are real macOS terminal sessions with GPU-accelerated rendering, 256-color and 24-bit color escapes drawn as sent, and Unicode 11 character widths, so colored diffs, prompt themes, and full-screen tools like lazygit or tig draw correctly. URLs and file paths in the output are clickable. You run git in one pane and your dev servers in another, inside the same native window. When you'd rather click, the footer has a branch switcher, a Commit dialog that drafts the message with AI, and Create PR.",
  },
  {
    question: "Is lpm a good iTerm2 alternative on Mac?",
    answer: (
      <>
        If you picked iTerm2 for tabs and split panes, lpm gives you those plus
        a visual project sidebar, a one-click full-stack start, and live output
        per service. If you only need a raw terminal with no project awareness,
        iTerm2 is still a fine choice — lpm is the step up for developers
        juggling multiple services and projects. There is a{" "}
        <Link
          href={vsPath("iterm2")}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          side-by-side comparison of lpm and iTerm2
        </Link>{" "}
        if you want the details.
      </>
    ),
    answerText:
      "If you picked iTerm2 for tabs and split panes, lpm gives you those plus a visual project sidebar, a one-click full-stack start, and live output per service. If you only need a raw terminal with no project awareness, iTerm2 is still a fine choice — lpm is the step up for developers juggling multiple services and projects. A side-by-side comparison of lpm and iTerm2 is at lpm.cx/vs/iterm2.",
  },
  {
    question: "How do I download lpm for macOS?",
    answer: (
      <>
        Use the{" "}
        <a
          href="#download"
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          download button on this page
        </a>
        , open the .dmg, and drag lpm to your Applications folder. The app
        supports macOS 12 and later on both Apple Silicon and Intel Macs. On
        first launch, point it at any project folder and lpm detects the
        services it can run.
      </>
    ),
    answerText:
      "Download the .dmg from lpm.cx, open it, and drag lpm to your Applications folder. The app supports macOS 12 and later on both Apple Silicon and Intel Macs. On first launch, point it at any project folder and lpm detects the services it can run.",
  },
  {
    question: "Does lpm have split panes, search, and themes?",
    answer:
      "Yes. ⌘D splits a pane to the right and ⌘⇧D splits it down, ⌘F searches any terminal or service log with an optional filter mode, and you can pick one of eight color themes, any installed monospace font, and a font size from 8 to 24. Each project remembers its own pane layout.",
  },
  {
    question: "Can I browse and edit files in lpm?",
    answer:
      "Yes, lightly. The Files tab (⌘⇧E) shows the project's folder tree, ⌘P jumps to any file by name, and the editor has syntax highlighting and saves with ⌘S. Markdown renders GitHub-style and images preview inline. It is not an IDE, so Open with sends the project to Cursor, VS Code, Zed, or Xcode when you need one.",
  },
  {
    question: "Is lpm a good terminal for beginners on Mac?",
    answer:
      "Yes. Beginners get a visual sidebar, one-click Start and Stop buttons, and services set up automatically for common frameworks like Rails, Next.js, Django, Flask, and Laravel. You never have to memorize which command starts which server: the Start menu lists every service by name, and your own commands become labelled buttons, while a full macOS terminal is still there when you want one.",
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
