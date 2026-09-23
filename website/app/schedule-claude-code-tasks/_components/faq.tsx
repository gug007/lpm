import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";
import { FAQS } from "./faq-data";

export default function Faq() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Scheduling Claude Code and Codex"
          description="How the scheduler works, what it needs, and what it won't do."
          className="mb-10"
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:text-gray-100 dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none dark:text-gray-400" />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </p>
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
