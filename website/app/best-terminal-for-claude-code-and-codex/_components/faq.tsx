import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";
import {
  CONNECT_AGENTS_PATH,
  PARALLEL_PATH,
  REPO_URL,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const LINK =
  "underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const FAQS: QA[] = [
  {
    question: "Does lpm work with Claude Code and Codex out of the box?",
    answer:
      "Yes. Every project gets a Claude and a Codex button on first launch, and lpm connects to both agents automatically, so the sidebar shows when an agent is working, needs an answer, hit a problem, or finished. Your services run in panes beside them. lpm doesn't install the agents themselves: you install the Claude Code and Codex CLIs and sign in as usual.",
  },
  {
    question: "Will lpm tell me when Claude Code or Codex needs me?",
    answer:
      "Yes. The agent's tab and its row in the sidebar change state, a chime plays when an agent finishes, asks for approval, or errors, and a macOS banner names the tab and project when no lpm window is in front. With the lpm Link iPhone app paired, the same events arrive as encrypted push notifications.",
  },
  {
    question: "Can I see my Claude Code and Codex usage limits?",
    answer:
      "Yes. The bottom of the sidebar shows how much of each plan window is used and when it resets, with a pace marker, and the Usage window shows the 5-hour and weekly windows side by side. Codex meters appear on their own once Codex runs; for Claude, press Enable once in the Usage window. Meters apply to subscription logins, since API-billed accounts have no 5-hour or weekly limit.",
  },
  {
    question: "Can I resume an old Claude Code or Codex session?",
    answer:
      "Yes. Resume session lists every Claude Code and Codex conversation for the project, including ones started outside lpm and tabs you closed, with search and a filter by agent. Picking one reopens it in a new tab, and you can fork a conversation to try a different direction without losing the original.",
  },
  {
    question: "Can I run multiple agents in parallel on the same repo?",
    answer: (
      <>
        Yes. Each agent works in its own copy of the repo, so they never edit
        the same files. Duplicate clones the project folder (dependencies,{" "}
        <code className="text-xs">.env</code>{" "}
        files, and uncommitted work included), and New Worktree checks out a real Git worktree on its own
        branch. Either way you can create up to 50 at once and queue the same
        prompt in each. The guide to{" "}
        <Link href={PARALLEL_PATH} className={LINK}>
          running Claude Code in parallel
        </Link>{" "}
        walks through it, and the{" "}
        <Link href={WORKTREE_AGENTS_PATH} className={LINK}>
          worktree guide
        </Link>{" "}
        covers which of the two to reach for.
      </>
    ),
    answerText:
      "Yes. Each agent works in its own copy of the repo, so they never edit the same files. Duplicate clones the project folder (dependencies, .env files, and uncommitted work included), and New Worktree checks out a real Git worktree on its own branch. Either way you can create up to 50 at once and queue the same prompt in each. See lpm.cx/run-claude-code-in-parallel for the walkthrough and lpm.cx/git-worktree-for-ai-agents for which of the two to reach for.",
  },
  {
    question: "Does lpm support Gemini CLI and OpenCode?",
    answer: (
      <>
        They run in lpm terminals like any other command, and lpm suggests
        launch buttons for them when their CLIs are installed. The deeper
        integration (live status, alerts, resume, fork, and the model switcher)
        is built for Claude Code and Codex. Any agent can still drive lpm
        through the{" "}
        <Link href={CONNECT_AGENTS_PATH} className={LINK}>
          lpm CLI and agent skills
        </Link>
        , and post its own status badge with{" "}
        <code className="text-xs">lpm set-status</code>.
      </>
    ),
    answerText:
      "They run in lpm terminals like any other command, and lpm suggests launch buttons for them when their CLIs are installed. The deeper integration (live status, alerts, resume, fork, and the model switcher) is built for Claude Code and Codex. Any agent can still drive lpm through the lpm CLI and agent skills, and post its own status badge with lpm set-status.",
  },
  {
    question: "Do I need Docker to use lpm?",
    answer:
      "No. lpm runs anything that runs in a terminal. Docker Compose stacks work, and plain Rails, Next.js, Go, Django, or Flask projects work without containers.",
  },
  {
    question: "Is lpm open source?",
    answer: (
      <>
        Yes. The source, issue tracker, and releases live on{" "}
        <a href={REPO_URL} className={LINK}>
          GitHub
        </a>
        . Contributions and bug reports are welcome.
      </>
    ),
    answerText: `Yes. The source, issue tracker, and releases live on GitHub at ${REPO_URL}. Contributions and bug reports are welcome.`,
  },
  {
    question: "Which frameworks does lpm work with?",
    answer:
      "Rails, Next.js, Django, FastAPI, Laravel, Phoenix, Go, Docker Compose, and anything else that runs in a terminal. When you add a folder, lpm reads its manifests and sets up the services for you. To go further, have your AI agent draft services and actions from the config editor.",
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
          title="Questions developers ask before switching"
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
