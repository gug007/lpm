import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm work with monorepos?",
    answer:
      "Yes. lpm is designed around multi-service projects. Open a monorepo folder and lpm reads your service definitions from a Procfile, docker-compose.yml, package.json workspaces config, or any combination. Each service gets its own pane and start/stop controls. You can start the entire monorepo in one click or bring up individual services independently.",
  },
  {
    question: "Can I use lpm alongside VS Code or another editor?",
    answer:
      "Yes. lpm is a terminal workspace, not an editor replacement. You write code in VS Code, Cursor, Zed, or whatever editor you prefer, and use lpm to run your dev stack, watch logs, and manage git — all in a native Mac window that sits alongside your editor.",
  },
  {
    question: "Does lpm support SSH or remote development?",
    answer:
      "lpm runs your local development stack natively on your Mac. It does not currently proxy SSH sessions or manage remote machines. If you need remote terminal sessions, you can open a plain shell pane in lpm and SSH from there, but the service management and log pane features apply to local processes only.",
  },
  {
    question: "How does lpm help when running multiple AI coding agents?",
    answer:
      "Each AI coding agent can be assigned its own lpm project workspace. That isolation means agents can run dev servers, execute tests, and write to log panes without conflicting with your running environment or with each other. You can watch every agent's output in real time, in separate labeled panes, from one Mac window.",
  },
  {
    question: "Can I use my existing shell setup (zsh, dotfiles, aliases) in lpm?",
    answer:
      "Yes. lpm panes are real terminal sessions running your default shell — zsh, bash, or fish — with your full dotfile configuration loaded. Every alias, function, $PATH entry, and prompt theme works exactly as it does in Terminal.app or iTerm2.",
  },
  {
    question: "How is lpm different from using tmux inside iTerm2?",
    answer:
      "tmux gives you pane multiplexing but no project awareness, no service lifecycle management, and no GUI for starting or stopping processes. lpm layers a visual project switcher, per-service start/stop controls, and a config editor on top of real terminal panes — so you get the workflow benefits of tmux without the config overhead, and with a native Mac interface that new team members can use on day one.",
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
          title="What developers ask before switching their Mac terminal"
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
