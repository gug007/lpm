import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export type FaqItem = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  items: FaqItem[];
};

export function Faq({ eyebrow = "FAQ", title, items }: Props) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer, answerText }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: typeof answer === "string" ? answer : answerText ?? "",
      },
    })),
  };

  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader eyebrow={eyebrow} title={title} />
        <ul className="space-y-3">
          {items.map(({ question, answer }) => (
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </section>
  );
}
