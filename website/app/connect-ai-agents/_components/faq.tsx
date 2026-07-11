import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Can Claude Code restart my dev server?",
    answer:
      "Yes. Once the lpm skill and CLI are installed, Claude Code can run lpm service <name> restart to bounce a single dev server, or lpm start / lpm stop for the whole project — then lpm wait to block until it is ready again.",
  },
  {
    question: "Which AI coding agents does this work with?",
    answer:
      "Claude Code, Codex, Gemini CLI, and OpenCode. The skill is installed both for Claude Code and for the open agent-skills directory that Codex, Gemini CLI, and OpenCode read, so the same lpm commands work across all of them.",
  },
  {
    question: "Do I need MCP to connect agents to lpm?",
    answer:
      "No. Agents drive lpm through a normal command-line tool. One click in Settings installs the skill and the lpm CLI together — there is no server to run and no MCP configuration.",
  },
  {
    question: "How does an agent know it is inside an lpm project?",
    answer:
      "Every terminal inside lpm is tagged with the project it belongs to. The installed skill triggers whenever an agent sees it, so the agent automatically knows it can use the lpm CLI to drive that project — with no per-project setup.",
  },
  {
    question: "Can I run multiple AI agents in parallel on copies of a project?",
    answer:
      "Yes. lpm duplicate clones a project into real standalone copies (up to 50) and can queue the same agent and prompt in each. lpm wait --agent blocks on a copy until its agent finishes, and lpm remove cleans up the copies you do not keep.",
  },
  {
    question: "Can agents read my dev-server logs?",
    answer:
      "Yes. lpm logs <service> returns the recent output of any running service, so an agent can see the error it just caused and fix it. Nearly every command also supports --json for structured output, and exit codes are agent-friendly.",
  },
  {
    question: "Does this run on Windows or Linux?",
    answer:
      "lpm is a native macOS app, so this is built for your Mac. There are no Windows or Linux builds.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Connecting agents to your dev environment"
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
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd(FAQS)),
          }}
        />
      </div>
    </section>
  );
}
