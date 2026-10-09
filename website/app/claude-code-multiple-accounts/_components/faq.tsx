import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "How is this different from claude-swap and other account switchers?",
    answer:
      "Switchers change the globally active account: back up the current credentials, restore another set, restart your sessions — and every project on the machine flips together. lpm never swaps a login. Each project points at its own account, all accounts stay signed in side by side, and two projects can run two different accounts at the same moment. Even automatic switching only decides which account the next new session starts on; nothing already running moves. There's also no credential handling: switchers copy token files or Keychain entries around; lpm just points each project at its own Claude Code home and lets Claude manage its own login there.",
  },
  {
    question:
      "I keep separate accounts because of usage limits — does each project get its own limit?",
    answer:
      "Each Claude subscription has its own usage allowance, and pinning means every terminal session in a project draws from that project's account. A heavy afternoon on a side project can't eat the work seat's quota. Turn on Claude usage in lpm and each account gets its own meter in the sidebar, its own card on the Usage page, and its 5-hour and weekly usage in the Claude account menu, so you can see which one is close before it runs out.",
  },
  {
    question: "What do I do when one account hits its limit?",
    answer:
      "Two ways. Turn on Switch accounts automatically in Settings, and new Claude sessions move to the next account in your list once one is close to its 5-hour or weekly limit: lpm either asks in the sidebar first or moves them on its own and tells you. Or open the project's menu in the sidebar and pick another account under Claude account, which shows each account's usage and when it resets. Either way, sessions already open keep the account they started with.",
  },
  {
    question: "How does automatic switching pick an account?",
    answer:
      "Up to three accounts take turns, in the order you drag them in Settings. A new session starts on the first one that is under 90% of both its 5-hour and weekly limits. Accounts that hit a limit, are signed out, or are signed in as the same Claude account twice are skipped; if every account is close, the one with the most room is used. A project can keep its own list with Choose accounts in its menu, and a pinned project never switches. Resuming a past conversation goes back to the account that holds it.",
  },
  {
    question: "Is switching accounts when one runs low allowed?",
    answer:
      "Before switching starts, lpm asks you to confirm that every account in the list is yours alone. Anthropic hasn't said whether switching accounts when one runs low is allowed, and it can limit or close accounts it believes break its terms; usage credits or a higher plan are Anthropic's supported ways to keep working past a limit. Team and Enterprise seats only join once you allow them, since their use counts against the organization, and if an account is ever put on hold, lpm pauses switching everywhere until you turn it back on.",
  },
  {
    question: "Do I have to log out and back in when I change projects?",
    answer:
      "No. You sign in to each account once, right after you add it in Settings. After that, moving between projects is just clicking in the sidebar; each project's terminals are already signed in as the right account, even when several projects with different accounts are running at once.",
  },
  {
    question: "Where are my credentials stored? Does lpm see my tokens?",
    answer:
      "Claude Code itself stores them, one login per account, wherever it normally keeps a login on your system (the Keychain on macOS) — the same mechanism as a single-account setup. lpm never reads, copies, or exports tokens. Removing an account from lpm deletes its sign-in, and projects pinned to it fall back to your main Claude login.",
  },
  {
    question: "Do my settings, memory, and skills work on every account?",
    answer:
      "Yes. Your Claude Code settings file, CLAUDE.md memory, skills, subagents, slash commands, and plugins are shared across all accounts, so a pinned project has the same tools and commands as your main setup. What Claude Code keeps in each account's own state, such as user-level MCP servers and past sessions, stays with that account. lpm's agent status (working, needs you, done) keeps working on pinned projects too.",
  },
  {
    question: "What happens to the account I already use?",
    answer:
      "Nothing. Your existing login stays the main one: any project without its own account keeps using it until you turn on switching, and you don't re-authenticate anything. You only add the extra accounts, a work seat or a client seat, and pin them where they belong.",
  },
  {
    question: "Do duplicates and worktrees keep the pinned account?",
    answer:
      "Yes. Copies and worktrees inherit the parent project's account or list, so a fan-out of a work repo stays on the work seat. A copy can still pick its own account from its menu in the sidebar, and Same as parent puts it back.",
  },
  {
    question: "I use an API key in some projects — does pinning interfere?",
    answer:
      "No; the pin decides which stored subscription login Claude Code uses, and a project that exports ANTHROPIC_API_KEY keeps billing to that key exactly as before.",
  },
  {
    question: "Does this work for Codex or other coding agents?",
    answer:
      "Pinning is Claude Code only. Codex runs in lpm terminals right alongside your pinned projects, but on its own single login, with no per-project account.",
  },
  {
    question: "Any limitations I should know about?",
    answer:
      "Per-project accounts apply to projects that run on your computer; SSH projects use whatever Claude login exists on the remote host. Scheduled automations run on the project's own account and never switch. Automatic switching needs Claude usage turned on in lpm, since it decides by each account's usage. Terminals that are already open keep the account they launched with, and a new choice applies to terminals you open afterwards. Keep Claude Code reasonably up to date, since pinning relies on it keeping each account's login separate. One gotcha: if you set CLAUDE_CONFIG_DIR by hand in your shell profile (such as ~/.zprofile, ~/.zshrc or ~/.bashrc), remove it, because a login shell re-sources it and overrides the per-project account.",
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
