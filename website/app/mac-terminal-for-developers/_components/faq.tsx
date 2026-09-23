import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm work with monorepos?",
    answer:
      "Yes. When you add a monorepo, lpm turns each workspace package or conventional app folder (apps/*, services/*, api, web, and similar) into its own service, up to 20 of them. Each service gets its own pane and its own switch in the Start menu, so you can start the whole repo in one click, bring up a single service, or save a profile such as backend only.",
  },
  {
    question: "Can I use lpm alongside VS Code or another editor?",
    answer:
      "Yes. lpm is a terminal workspace, not an editor replacement. You write code in VS Code, Cursor, Zed, or whatever editor you prefer, and Open with sends a project straight to it. lpm runs your dev stack, shows the logs, and handles git in a native Mac window that sits alongside your editor.",
  },
  {
    question: "Does lpm support SSH or remote development?",
    answer:
      "Yes. lpm supports SSH remote projects: connect to a remote dev box, forward remote ports to localhost, and run remote services in panes. An SSH project is listed right beside your local ones, and its services and logs behave like local ones.",
  },
  {
    question: "How does lpm help when running multiple AI coding agents?",
    answer:
      "Put each agent in a separate copy, Duplicate or New Worktree, so no two agents edit the same files and your working copy stays untouched. Each copy has its own terminals and services and appears under the original in the sidebar. Copies use the same ports as the original, so lpm warns you when two want the same one and offers to free it.",
  },
  {
    question: "Can I use my existing shell setup (zsh, dotfiles, aliases) in lpm?",
    answer:
      "Yes, including the parts a monorepo depends on. Each pane starts your default shell as a login shell, so .zshrc and .zprofile run, your version managers (nvm, pyenv, rbenv, mise) initialize, and direnv still swaps environments as you cd between packages. Every alias, function, $PATH entry, and prompt theme behaves the way it does in Terminal.app. Each service and terminal also starts in the working directory you gave it, so a pane opens straight into the package it belongs to instead of at the repo root.",
  },
  {
    question: "How is lpm different from using tmux inside iTerm2?",
    answer:
      "tmux gives you pane multiplexing but no project awareness, no service lifecycle management, and no GUI for starting or stopping processes. lpm gives you a visual project switcher, per-service start/stop controls, and a config editor alongside real terminal panes, so you get the workflow benefits of tmux without the config overhead, and with a native Mac interface that new team members can use on day one.",
  },
  {
    question: "What happens when two projects want the same port?",
    answer:
      "lpm checks a project's ports when you press Start. If one is taken, it tells you who holds it, another lpm project or a named process, and offers to stop that holder and start yours. Each service can also be set to always ask, free the port automatically, or not start.",
  },
  {
    question: "Can I control lpm from scripts?",
    answer:
      "Yes. The lpm command line tool, installed from Settings, starts and stops projects and single services, prints a service's recent logs, and waits for a port or service to be ready. Its commands take --json for machine-readable output, which makes it easy to use from scripts and from AI coding agents.",
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
          title="What full-stack developers ask before moving their stack into lpm"
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
