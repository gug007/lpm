import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FaqAsk } from "@/components/home/faq-ask";
import { SectionHeader } from "@/components/section-header";
import { OTHER_STATUS_AGENT_NAMES } from "@/lib/app-facts";
import {
  LINUX_HOST_PATH,
  MAC_MINI_PATH,
  MOBILE_PATH,
  PRIVACY_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  // The yes-or-no most readers came for, shown without a click.
  short: string;
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
    short:
      "Yes. Free and open source under the MIT license, with no paid tier and no account.",
    answer:
      "Yes. lpm is free and open source under the MIT license. There is no paid tier and no account: download it from lpm.cx, or browse the source on GitHub.",
  },
  {
    question: "Which systems does lpm run on?",
    short:
      "macOS 12 or later, on Apple Silicon and Intel. Windows 11 and x86-64 Linux are in beta.",
    answer:
      "macOS 12 or later, with one build for Apple Silicon and one for Intel, both signed with an Apple-issued Developer ID and notarized by Apple. Windows and Linux are in beta: Windows 11 on x64 with Git for Windows installed, and 64-bit x86 Linux with glibc 2.35 or newer (Ubuntu 22.04 and up) as a .deb, .rpm or AppImage. The Windows and Linux builds aren't code-signed yet. None of them uses Electron.",
  },
  {
    question: "Does lpm detect my services automatically?",
    short:
      "Yes. It reads package.json, Procfile, Docker Compose and Python, Rails, Go or Rust projects, on your computer and with no AI.",
    answer:
      "Yes. When you add a folder or clone a repo, lpm reads its files (package.json, Procfile, Docker Compose, and Python, Rails, Go or Rust projects, including apps inside a monorepo) and sets up each dev server with its start command and, when it can tell, its port. Detection runs on your computer with no AI involved. If nothing is found, you get a starter service to fill in, and your AI agent can draft the setup for you.",
  },
  {
    question: "Which AI coding agents does lpm support?",
    short:
      `Claude Code and Codex get one-click buttons and live status. ${OTHER_STATUS_AGENT_NAMES} get live status, and any other CLI agent runs in the terminal.`,
    answer:
      `Claude Code and Codex get one-click buttons from the first launch and the deepest integration: live working, done and needs-you status, sounds and system notifications, resume and fork, and a model and effort picker. ${OTHER_STATUS_AGENT_NAMES} report live status with sounds and notifications too. Gemini CLI and OpenCode can be added as one-click buttons, and any other command-line agent or script runs in the built-in terminal. lpm doesn't install the agents; you use your own CLI and account.`,
  },
  {
    question: "Does lpm replace my terminal or editor?",
    short:
      "It can replace your terminal, with tabs, split panes, search, a Files tab and diff review. It opens projects in your editor.",
    answer:
      "It can replace your terminal: every project gets tabs, split panes, search, a Files tab with an editor, diff review and, on macOS and Windows, a built-in browser tab. It works alongside your code editor, and one click opens a project in Cursor, VS Code, Zed and others.",
  },
  {
    question: "Is there an iPhone app?",
    short:
      "Yes. lpm link pairs by QR code, mirrors your terminals live and tells you when an agent needs you.",
    answer: (
      <>
        Yes.{" "}
        <Link href={MOBILE_PATH} className={LINK}>
          lpm link
        </Link>{" "}
        pairs with your computer by QR code. It mirrors your terminals live so
        you can type into them, shows which agent needs you, sends encrypted
        push notifications, and lets you start projects, review diffs, commit
        and run automations. Everything still runs on your computer.
      </>
    ),
    answerText:
      "Yes. lpm link pairs with your computer by QR code. It mirrors your terminals live so you can type into them, shows which agent needs you, sends encrypted push notifications, and lets you start projects, review diffs, commit and run automations. Everything still runs on your computer.",
  },
  {
    question: "Does lpm work with remote servers?",
    short:
      "Yes. Run a project over SSH, or add a Linux server with one SSH string and keep its agents running there.",
    answer: (
      <>
        Yes, in three ways. An{" "}
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
        running on the server. Or{" "}
        <Link href={MAC_MINI_PATH} className={LINK}>
          pair a Mac that stays on
        </Link>
        , like a Mac mini, and run Claude Code and Codex there from your
        laptop.
      </>
    ),
    answerText:
      "Yes, in three ways. An SSH project runs its terminals, services and actions on any server you can SSH into. Or add a Linux server with one SSH string: lpm installs itself there (x86-64, Ubuntu 22.04 or newer), and the server's projects show up in your sidebar and keep running on the server. Or pair a Mac that stays on, like a Mac mini, and run Claude Code and Codex there from your laptop.",
  },
  {
    question: "Does lpm collect my code or telemetry?",
    short:
      "No. The desktop app has no analytics or account, and crash reports can be turned off in Settings.",
    answer: (
      <>
        No. The desktop app has no analytics or account, and crash reports
        can be turned off in Settings. It checks
        GitHub for updates, and AI features such as commit messages run through
        your own agent CLI. If you pair an iPhone and turn on push
        notifications, they are sealed on your computer and relayed through lpm.cx,
        which can&apos;t read them. Only this website uses visitor analytics;
        see the{" "}
        <Link href={PRIVACY_PATH} className={LINK}>
          privacy policy
        </Link>
        .
      </>
    ),
    answerText:
      "No. The desktop app has no analytics or account, and crash reports can be turned off in Settings. It checks GitHub for updates, and AI features such as commit messages run through your own agent CLI. If you pair an iPhone and turn on push notifications, they are sealed on your computer and relayed through lpm.cx, which can't read them. Only this website uses visitor analytics; see the privacy policy.",
  },
  {
    question: "How does lpm update?",
    short:
      "It checks at launch and every 24 hours. On macOS one click updates and relaunches, and your dev servers keep running.",
    answer:
      "lpm checks for a new version when it opens and every 24 hours while it runs, and you can choose Check for Updates… from the lpm menu. On macOS, an update button appears in the sidebar: one click downloads it, replaces the app and relaunches, and your dev servers keep running through the update. On Windows and Linux, lpm tells you about the new version and opens its download in your browser; run the installer or install the package to update.",
  },
  {
    question: "How do I uninstall lpm?",
    short:
      "Settings → General → Remove app. It cleans up its command, hooks and skills, and never touches your project folders.",
    answer: (
      <>
        Open Settings → General → Remove app. lpm stops your projects and
        removes the <code className={CODE}>lpm</code>{" "}command, its agent
        skills, the hooks it added to Claude Code and Codex, and its Claude
        Code status line. On macOS it also moves the app to the Trash, with an
        option to erase its settings, project configuration and notes. On
        Windows, finish in Settings → Apps → Installed apps; on Linux, remove
        the package or delete the AppImage. Your project folders are never
        touched. To do it by hand on macOS, quit lpm, move lpm.app to the
        Trash, delete <code className={CODE}>/usr/local/bin/lpm</code>{" "}and{" "}
        <code className={CODE}>~/.lpm</code>, then remove the lpm hooks in{" "}
        <code className={CODE}>~/.claude</code>{" "}and{" "}
        <code className={CODE}>~/.codex</code>{" "}and the lpm skills in{" "}
        <code className={CODE}>~/.claude/skills</code>{" "}and{" "}
        <code className={CODE}>~/.agents/skills</code>.
      </>
    ),
    answerText:
      "Open Settings → General → Remove app. lpm stops your projects and removes the lpm command, its agent skills, the hooks it added to Claude Code and Codex, and its Claude Code status line. On macOS it also moves the app to the Trash, with an option to erase its settings, project configuration and notes. On Windows, finish in Settings → Apps → Installed apps; on Linux, remove the package or delete the AppImage. Your project folders are never touched. To do it by hand on macOS, quit lpm, move lpm.app to the Trash, delete /usr/local/bin/lpm and ~/.lpm, then remove the lpm hooks in ~/.claude and ~/.codex and the lpm skills in ~/.claude/skills and ~/.agents/skills.",
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
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions developers ask before downloading"
          className="mb-10 sm:mb-12"
        />
        <ul className="grid gap-x-12 md:grid-cols-2">
          {FAQS.map(({ question, short, answer }) => (
            <li
              key={question}
              className="group/qa border-t border-gray-200 py-5 dark:border-gray-800"
            >
              <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                {question}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600 group-has-[details[open]]/qa:hidden dark:text-gray-400">
                {short}
              </p>
              <details className="group">
                <summary className="-ml-1 mt-1 inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded px-1 text-[13px] font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Full answer</span>
                  <span className="hidden group-open:inline">Show less</span>
                  <ChevronDown
                    className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="-mt-1 mb-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <FaqAsk />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
        />
      </div>
    </section>
  );
}
