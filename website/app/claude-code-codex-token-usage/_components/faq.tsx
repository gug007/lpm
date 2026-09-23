import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

const FAQS = [
  {
    question: "What can I track for Claude Code and Codex?",
    answer:
      "Stats counts total, input, cached input, output, and, where the CLI reports it, reasoning tokens, with an estimated cost. Break usage down by day, provider, project, and recent session over Today, 7 days, 30 days, or All time. Usage shows how much of your 5-hour and weekly plan limits you have used.",
  },
  {
    question: "Can lpm show my Claude Code 5-hour and weekly limits?",
    answer:
      "Yes. Open Usage and press Enable on the Claude card. From then on, Claude Code sessions you run in lpm terminals report how much of the current 5-hour and weekly windows you have used and when each one resets. It works with Pro and Max logins; an API-key login has no plan windows to show. Your existing status line keeps working.",
  },
  {
    question: "Does it track Codex rate limits too?",
    answer:
      "Yes, with no setup. The first time you run Codex in a project, its 5-hour and weekly meters appear in Usage and in the sidebar.",
  },
  {
    question: "What do ahead of pace, on pace, and under pace mean?",
    answer:
      "lpm compares how much of a window you have used with how much of it has passed. Ahead of pace means you are spending faster than the window refills, and if the current rate would run out before the reset, lpm tells you roughly when. The tick on each sidebar bar marks how much of the window has passed.",
  },
  {
    question: "Where do I find Stats and Usage in lpm?",
    answer:
      "Both sit in the More menu at the bottom of the sidebar, and either can be moved into the sidebar itself. Clicking the sidebar usage meter also opens Usage, and the lpm iPhone app has Usage and Stats screens.",
  },
  {
    question: "Where does lpm get the numbers?",
    answer:
      "Token counts come from usage metadata in the local Claude Code and Codex session histories, matched to the lpm project each session ran in. Limit readings are what the CLIs report while they run. lpm does not ask Anthropic or OpenAI for anything.",
  },
  {
    question: "Does the stats dashboard include my prompts or responses?",
    answer:
      "No. Usage metadata stays on this Mac, and prompts and responses are not included in the stats dashboard.",
  },
  {
    question: "Is the estimated cost the same as my bill?",
    answer:
      "No. It is an estimate at public list prices per recognized model, with cached reads and writes priced separately. Codex pricing is approximate, and on a subscription you do not pay per token, so use your provider's billing page as the source of truth.",
  },
  {
    question: "Can I find which project or session used the most tokens?",
    answer:
      "Yes. Sort projects by tokens or sessions, then inspect recent sessions with provider, model, duration, recency, and token composition details.",
  },
  {
    question: "Are remote projects included?",
    answer:
      "Not currently. Stats counts projects configured on this Mac; SSH projects and projects on connected Linux servers or other Macs are not included.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Claude Code and Codex usage, answered"
          description="What Stats and Usage count, where the numbers come from, and what stays private."
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
