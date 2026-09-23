import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import {
  LINUX_HOST_PATH,
  MOBILE_PATH,
  PRIVACY_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const LINK =
  "font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white";
const CODE =
  "rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-gray-700 dark:bg-white/[0.06] dark:text-gray-300";

const FAQS: QA[] = [
  {
    question: "Is lpm free?",
    answer:
      "Yes. lpm is free and open source under the MIT license. There is no paid tier and no account: download it from lpm.cx, or browse the source on GitHub.",
  },
  {
    question: "Which Macs and macOS versions are supported?",
    answer:
      "lpm runs on macOS 12 or later. Download the Apple Silicon or the Intel build; both are signed with an Apple-issued Developer ID and notarized by Apple, and there is no Electron runtime.",
  },
  {
    question: "Does lpm detect my services automatically?",
    answer:
      "Yes. When you add a folder or clone a repo, lpm reads its files (package.json, Procfile, Docker Compose, and Python, Rails, Go or Rust projects, including apps inside a monorepo) and sets up each dev server with its start command and, when it can tell, its port. Detection runs on your Mac with no AI involved. If nothing is found, you get a starter service to fill in, and your AI agent can draft the setup for you.",
  },
  {
    question: "Which AI coding agents does lpm support?",
    answer:
      "Claude Code and Codex get one-click buttons from the first launch and the deepest integration: live working, done and needs-you status, sounds and macOS notifications, resume and fork, and a model and effort picker. Gemini CLI and OpenCode can be added as one-click buttons too, and any other command-line agent or script runs in the built-in terminal. lpm doesn't install the agents; you use your own CLI and account.",
  },
  {
    question: "Does lpm replace my terminal or editor?",
    answer:
      "It can replace your terminal: every project gets tabs, split panes, search, a Files tab with an editor, a built-in browser tab and diff review. It works alongside your code editor, and one click opens a project in Cursor, VS Code, Zed, Xcode and others.",
  },
  {
    question: "Is there an iPhone app?",
    answer: (
      <>
        Yes.{" "}
        <Link href={MOBILE_PATH} className={LINK}>
          lpm link
        </Link>{" "}
        pairs with your Mac by QR code. It mirrors your terminals live so you
        can type into them, shows which agent needs you, sends encrypted push
        notifications, and lets you start projects, review diffs, commit and
        run automations. Everything still runs on your Mac.
      </>
    ),
    answerText:
      "Yes. lpm link pairs with your Mac by QR code. It mirrors your terminals live so you can type into them, shows which agent needs you, sends encrypted push notifications, and lets you start projects, review diffs, commit and run automations. Everything still runs on your Mac.",
  },
  {
    question: "Does lpm work with remote servers?",
    answer: (
      <>
        Yes, in two ways. An{" "}
        <Link href={SSH_TERMINAL_MAC_PATH} className={LINK}>
          SSH project
        </Link>{" "}
        runs its terminals, services and actions on any server you can SSH
        into. Or{" "}
        <Link href={LINUX_HOST_PATH} className={LINK}>
          add a Linux server
        </Link>{" "}
        with one SSH string: lpm installs itself there (x86-64, Ubuntu 22.04 or
        newer), and the server&apos;s projects show up in your sidebar and keep
        running on the server.
      </>
    ),
    answerText:
      "Yes, in two ways. An SSH project runs its terminals, services and actions on any server you can SSH into. Or add a Linux server with one SSH string: lpm installs itself there (x86-64, Ubuntu 22.04 or newer), and the server's projects show up in your sidebar and keep running on the server.",
  },
  {
    question: "Does lpm collect my code or telemetry?",
    answer: (
      <>
        No. The desktop app has no analytics, telemetry or account. It checks
        GitHub for updates, and AI features such as commit messages run through
        your own agent CLI. If you pair an iPhone and turn on push
        notifications, they are sealed on your Mac and relayed through lpm.cx,
        which can&apos;t read them. Only this website uses visitor analytics;
        see the{" "}
        <Link href={PRIVACY_PATH} className={LINK}>
          privacy policy
        </Link>
        .
      </>
    ),
    answerText:
      "No. The desktop app has no analytics, telemetry or account. It checks GitHub for updates, and AI features such as commit messages run through your own agent CLI. If you pair an iPhone and turn on push notifications, they are sealed on your Mac and relayed through lpm.cx, which can't read them. Only this website uses visitor analytics; see the privacy policy.",
  },
  {
    question: "How does lpm update?",
    answer:
      "lpm checks for a new version when it opens and every 24 hours while it runs. When one is out, an update button appears in the sidebar: one click downloads it, replaces the app and relaunches. You can also choose Check for Updates… from the lpm menu. Your dev servers keep running through the update.",
  },
  {
    question: "How do I uninstall lpm?",
    answer: (
      <>
        Open Settings → General → Remove app. lpm stops your projects and
        removes itself: the app, the <code className={CODE}>lpm</code>{" "}
        command, its agent skills, the hooks it added to Claude Code and
        Codex, and its Claude Code status line, with an option to also erase
        its settings, project configuration and notes. Your project folders
        are never touched. To do it by hand, quit lpm, move lpm.app to the
        Trash, delete <code className={CODE}>/usr/local/bin/lpm</code>{" "}and{" "}
        <code className={CODE}>~/.lpm</code>, then remove the lpm hooks in{" "}
        <code className={CODE}>~/.claude</code>{" "}and{" "}
        <code className={CODE}>~/.codex</code>{" "}and the lpm skills in{" "}
        <code className={CODE}>~/.claude/skills</code>{" "}and{" "}
        <code className={CODE}>~/.agents/skills</code>.
      </>
    ),
    answerText:
      "Open Settings → General → Remove app. lpm stops your projects and removes itself: the app, the lpm command, its agent skills, the hooks it added to Claude Code and Codex, and its Claude Code status line, with an option to also erase its settings, project configuration and notes. Your project folders are never touched. To do it by hand, quit lpm, move lpm.app to the Trash, delete /usr/local/bin/lpm and ~/.lpm, then remove the lpm hooks in ~/.claude and ~/.codex and the lpm skills in ~/.claude/skills and ~/.agents/skills.",
  },
];

const structuredData = faqJsonLd(
  FAQS.map(({ question, answer, answerText }) => ({
    question,
    answer: typeof answer === "string" ? answer : (answerText ?? ""),
  })),
);

export function HomeFaq() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions developers ask before downloading"
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200 open:border-gray-300 dark:open:border-gray-700 open:bg-gray-50/50 dark:open:bg-white/[0.02]">
                <summary className="flex min-h-11 items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown
                    className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
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
          dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
        />
      </div>
    </section>
  );
}
