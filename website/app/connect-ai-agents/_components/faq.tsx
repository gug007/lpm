import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

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
      "Every terminal inside lpm is tagged with the project it belongs to. Ask the agent to restart a server, read logs, or fan out, and it reaches for the lpm skill; the tag then lets it leave out the project name. No per-project setup is needed.",
  },
  {
    question: "Can I invoke the skill manually?",
    answer:
      "Yes. Type /lpm in Claude Code, or ask any other agent to use the lpm skill, to load both lpm skills at once: project control and config editing. It's useful in a terminal outside lpm, or whenever you want the skill in explicitly instead of waiting for the agent to pick it up.",
  },
  {
    question: "Can I run multiple AI agents in parallel on copies of a project?",
    answer:
      "Yes. lpm duplicate clones a project into real standalone copies (up to 50) and can queue the same agent and prompt in each; lpm worktree does the same with linked Git worktrees. lpm wait <copy> --agent blocks on a copy until its agent finishes, and lpm remove cleans up the copies you do not keep.",
  },
  {
    question: "Should an agent call lpm duplicate or lpm worktree?",
    answer:
      "Reach for lpm duplicate if the agent must see your working state: node_modules, .env files and uncommitted edits come along, and flags can drop the edits or reinstall dependencies. Use lpm worktree when committed code is enough: it branches off your current commit, costs little disk and merges back easily, but ignored and uncommitted files are missing.",
  },
  {
    question: "Can Claude Code and Codex share context?",
    answer:
      "Yes, through the lpm-memory skill. An agent saves a named work session with its goal, current state, and a timeline, and any other agent can continue it by name, for example /lpm-memory auth-refactor. Memory is read only when you ask for it and lives on your Mac, per project.",
  },
  {
    question: "Can I manage automations from the command line?",
    answer:
      "Yes. lpm automations lists your scheduled agent jobs, runs or stops one, pauses or resumes its schedule, prints its history or live output, and replies to an AI automation's conversation. Creating and editing jobs happens in the app, and the bundled skills don't cover automations, so tell an agent about these commands if you want it to use them.",
  },
  {
    question: "Can agents read my dev-server logs?",
    answer:
      "Yes. lpm logs <service> returns the recent output of any running service, so an agent can see the error it just caused and fix it. Nearly every command also supports --json for structured output, and exit codes are agent-friendly.",
  },
  {
    question: "Does this run on Windows or Linux?",
    answer:
      "The app itself is native macOS only — there is no Windows build. Linux is supported as a host: the same lpm runs headless on a Debian or Ubuntu x86_64 server, and you add it from your Mac by typing user@host in Settings → Connections. That server's projects, terminals and agents then appear in your Mac sidebar, and the lpm command-line tool is installed there too.",
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
          dangerouslySetInnerHTML={{
            __html: jsonLdString(faqJsonLd(FAQS)),
          }}
        />
      </div>
    </section>
  );
}
