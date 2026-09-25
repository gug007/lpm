import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { FAQ_ITEMS } from "./faq-data";
import { INLINE_CODE, KBD } from "./page-styles";

const CODE_TERMS = [
  "~/.claude/settings.json",
  "~/.codex/sessions",
  "cleanupPeriodDays",
  "CODEX_HOME",
  "/statusline",
  "/status",
  "/usage",
  "/cost",
  "/stats",
  "/clear",
];

const KEY_COMBO = "⌥↵";

const escapeRegExp = (term: string) =>
  term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TERMS = [...CODE_TERMS]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const TOKEN = new RegExp(`((?<![\\w./])(?:${TERMS})(?![\\w/])|${KEY_COMBO})`);

function formatAnswer(text: string) {
  return text.split(TOKEN).map((part, i) => {
    if (i % 2 === 0) return part;
    return part === KEY_COMBO ? (
      <kbd key={i} className={KBD}>
        {part}
      </kbd>
    ) : (
      <code key={i} className={INLINE_CODE}>
        {part}
      </code>
    );
  });
}

export default function Faq() {
  return (
    <section id="faq" className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Claude Code and Codex usage, answered"
        />
        <ul className="space-y-3">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 motion-reduce:transition-none dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden dark:text-gray-100">
                  <span>{question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none dark:text-gray-400"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {formatAnswer(answer)}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
