import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Can I use lpm as my primary git terminal on Mac?",
    answer:
      "Yes. lpm panes are real terminal sessions running your default shell — zsh, bash, or fish — with your full dotfile configuration loaded. Every git command, alias, and credential helper works exactly as it does in Terminal.app or iTerm2. You get a shell pane for git right next to your running service panes, all in one native Mac window.",
  },
  {
    question: "Does lpm replace a GUI git client like GitKraken or SourceTree?",
    answer:
      "For developers who prefer typing git commands, yes. lpm does not show a visual branch graph — it gives you a real shell where you run `git log --oneline --graph`, `git rebase -i`, and `git push` as you normally would, while your dev servers keep streaming in adjacent panes. If you rely on a click-to-cherry-pick GUI, you can still run GitKraken alongside lpm, but most terminal-first developers find the shell pane is all they need.",
  },
  {
    question: "Will my dev server stop running when I switch git branches inside lpm?",
    answer:
      "No. Service panes in lpm run independently of which branch your shell is on. When you `git checkout feature/xyz` in a shell pane, the service panes keep streaming. If a branch change requires a dependency install or a migration, you control when to restart services — lpm won't restart them behind your back.",
  },
  {
    question: "How does lpm help with PR review workflows on Mac?",
    answer:
      "You can open a second lpm workspace pointed at the same repo, check out the review branch there, start just the services you need, test the change, and switch back to your main workspace — all within lpm. Your original branch, its running services, and your terminal history are exactly as you left them.",
  },
  {
    question: "Can I run `git bisect` or long-running git operations inside lpm?",
    answer:
      "Yes. A shell pane in lpm is a full terminal session — `git bisect`, `git rebase -i`, `git filter-branch`, and any other long-running git operation runs exactly as it would in iTerm2 or Terminal.app. The other service panes keep running alongside it so you can see the effect of each bisect step on your live stack.",
  },
  {
    question: "Is lpm a good terminal for Mac developers who use GitHub CLI (`gh`)?",
    answer:
      "Yes. lpm shell panes run your full shell configuration, so `gh pr create`, `gh pr checkout`, `gh run watch`, and any other GitHub CLI command work with your existing auth and aliases. Run `gh run watch` in a shell pane while your dev server streams in the next pane — you get CI output and local output in the same window without a browser tab.",
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
          title="What Mac developers ask about terminal git workflows"
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
