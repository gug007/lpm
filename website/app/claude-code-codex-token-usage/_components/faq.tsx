import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

const FAQS = [
  {
    question: "What can I track for Claude Code and Codex?",
    answer:
      "lpm tracks total, input, cached input, output, and available reasoning-token metadata. You can break usage down by day, provider, project, model, and recent session, with Today, 7 days, 30 days, and All time ranges.",
  },
  {
    question: "Where does lpm get the token usage data?",
    answer:
      "lpm reads usage metadata from local Claude Code and Codex session histories, then matches each session’s working directory to a configured local lpm project.",
  },
  {
    question: "Does the stats dashboard include my prompts or responses?",
    answer:
      "No. Usage metadata stays on this Mac, and prompts and responses are not included in the stats dashboard.",
  },
  {
    question: "Is the estimated cost the same as my bill?",
    answer:
      "No. It is an estimate based on current public list prices per recognized model, with cached reads and writes priced separately. OpenAI and Codex pricing is approximate, so use your provider’s billing page as the source of truth.",
  },
  {
    question: "Can I find which project or session used the most tokens?",
    answer:
      "Yes. Sort projects by tokens or sessions, then inspect recent sessions with provider, model, duration, recency, and token composition details.",
  },
  {
    question: "Are remote SSH projects included?",
    answer:
      "Not currently. The stats dashboard counts configured local projects and excludes SSH projects.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Claude Code and Codex token usage"
          description="What the dashboard counts, where the data comes from, and what stays private."
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:text-gray-100 dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180 dark:text-gray-500" />
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
