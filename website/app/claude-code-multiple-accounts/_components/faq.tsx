import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "How is this different from claude-swap and other account switchers?",
    answer:
      "Switchers change the globally active account: back up the current credentials, restore another set, restart your sessions — and every project on the machine flips together. lpm doesn't switch anything. Each project is pinned to an account, all accounts stay signed in side by side, and two projects can run two different accounts at the same moment. There's also no credential handling: switchers copy token files or Keychain entries around; lpm just points each project at its own Claude Code home and lets Claude manage its own login there.",
  },
  {
    question: "Do I have to log out and back in when I change projects?",
    answer:
      "No. You sign in to each account exactly once — the first time a project pinned to it opens a terminal. After that, moving between projects is just clicking in the sidebar; each project's terminals are already signed in as the right account, even when several projects with different accounts are running at once.",
  },
  {
    question: "Where are my credentials stored? Does lpm see my tokens?",
    answer:
      "Credentials live in the macOS Keychain, written and read by Claude Code itself — the same mechanism as a single-account setup, one entry per account. lpm never reads, stores, copies, or exports tokens, and nothing sensitive lands in lpm's own files. Removing an account from lpm doesn't touch the login; it just stops projects from using it.",
  },
  {
    question: "Do my settings, memory, and skills work on every account?",
    answer:
      "Yes. Your Claude Code settings, memory file, skills, custom agents, and slash commands are shared across all accounts automatically, so a pinned project behaves exactly like your main setup — same commands, same tools, different identity. lpm's agent status badges (working / needs approval / done) keep working on pinned projects too.",
  },
  {
    question: "What happens to the account I already use?",
    answer:
      "Nothing. Your existing login stays the default: any project without a pin keeps using it, and you don't re-authenticate anything. You only add the extra accounts — a work seat, a client seat — and pin them where they belong.",
  },
  {
    question: "Any limitations I should know about?",
    answer:
      "Two. Account pinning applies to projects that run on your Mac — SSH projects use whatever Claude login exists on the remote host. And it relies on Claude Code's per-home credential isolation, which shipped in early 2026, so keep Claude Code reasonably up to date. Also worth knowing: terminals that are already open keep the account they launched with; a new pin applies to terminals you open afterwards.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="What developers ask about running multiple Claude Code accounts"
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
