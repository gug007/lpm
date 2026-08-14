import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

const FAQS = [
  {
    question: "How do I customize a Claude Code statusline in lpm?",
    answer:
      "Open Settings from the bottom of the lpm sidebar, choose AI & Integrations, and click Customize beside Claude Code status line. Start with Clean, Minimalistic, Modern, or Custom, then arrange items and tune their appearance. lpm applies valid changes while you work.",
  },
  {
    question: "What can I change in the Claude Code statusline?",
    answer:
      "You can arrange the project folder, full path, model, Git branch, context remaining, five-hour usage, weekly usage, session cost, and custom text. Each item can have its own color, label, and icon. You can also choose separators, usage meter styles, meter width, icons, and Git status.",
  },
  {
    question: "How does Codex statusline customization work in lpm?",
    answer:
      "lpm shows the fields supported by your Codex version, including model, reasoning, project, Git, context, limits, tokens, run state, permissions, task progress, and thread details. Pick a preset, add or remove fields, reorder them, and choose whether Codex uses its active theme colors.",
  },
  {
    question: "Do I need to edit settings.json or config.toml?",
    answer:
      "No. lpm provides visual controls and saves the matching local configuration for Claude Code or Codex. You can customize either statusline without hand-editing scripts, JSON, or TOML.",
  },
  {
    question: "Can lpm hide the statusline?",
    answer:
      "Yes. Choose Off to hide the configurable statusline. For Codex, removing every item also hides the footer. You can return to a preset or add fields again at any time.",
  },
  {
    question: "Does the statusline use extra AI tokens?",
    answer:
      "No. The statusline formats session information already exposed by Claude Code or Codex. Previewing and rendering it does not send an additional model request.",
  },
  {
    question: "Is statusline configuration private?",
    answer:
      "Yes. lpm is a native macOS app and applies statusline settings locally on your Mac. The visual editor does not require you to paste agent configuration or session data into a website.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="What to know before you customize"
          description="How the visual editor works, what each agent supports, and what stays on your Mac."
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:text-gray-100 dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd(FAQS)) }}
        />
      </div>
    </section>
  );
}
