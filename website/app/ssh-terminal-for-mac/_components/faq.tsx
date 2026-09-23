import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm replace Termius as my SSH client on Mac?",
    answer: (
      <>
        For developers who want their terminal to handle remote work alongside
        local services, yes — lpm reads the hosts already in your{" "}
        <code className="text-xs">~/.ssh/config</code> (no separate host vault),
        runs remote services in panes, and forwards
        ports without leaving the window. You can browse and read the remote
        project&apos;s files (read-only), but for SFTP transfers or a snippet
        library Termius still does more; lpm is a terminal-first SSH workspace,
        not a feature-parity Termius alternative on Mac.
      </>
    ),
    answerText:
      "For developers who want their terminal to handle remote work alongside local services, yes — lpm reads the hosts already in your ~/.ssh/config (no separate host vault), runs remote services in panes, and forwards ports without leaving the window. You can browse and read the remote project's files (read-only), but for SFTP transfers or a snippet library Termius still does more; lpm is a terminal-first SSH workspace, not a feature-parity Termius alternative on Mac.",
  },
  {
    question: "How does lpm import my SSH config?",
    answer: (
      <>
        When you add an SSH project, lpm reads{" "}
        <code className="text-xs">~/.ssh/config</code> (and any files pulled in
        by <code className="text-xs">Include</code> directives, up to four
        levels deep), parses out the non-wildcard{" "}
        <code className="text-xs">Host</code> blocks, and shows them in a
        dropdown. Pick a host and lpm pre-fills the host alias, user, port, and
        identity file in the form. lpm connects through that alias, so OpenSSH
        can still apply alias-scoped options such as{" "}
        <code className="text-xs">HostName</code>,{" "}
        <code className="text-xs">ProxyJump</code>, and{" "}
        <code className="text-xs">ProxyCommand</code>. The import is one read,
        and your config file stays the source of truth.
      </>
    ),
    answerText:
      "When you add an SSH project, lpm reads ~/.ssh/config (and any files pulled in by Include directives, up to four levels deep), parses out the non-wildcard Host blocks, and shows them in a dropdown. Pick a host and lpm pre-fills the host alias, user, port, and identity file in the form. lpm connects through that alias, so OpenSSH can still apply alias-scoped options such as HostName, ProxyJump, and ProxyCommand. The import is one read, and your config file stays the source of truth.",
  },
  {
    question: "Can I forward a remote port to localhost without typing ssh -L?",
    answer: (
      <>
        Yes, that&apos;s the whole point of the Ports popover. Type the remote
        port, leave the local port blank, and hit Enter; lpm opens the forward
        and shows the success toast only once the local address actually
        answers, so you know the tunnel is usable, not just started. Declared
        service ports forward automatically as soon as the remote server
        listens, and other ports lpm spots on the remote show up as one-click
        suggestions: remote port forwarding without the{" "}
        <code className="text-xs">ssh -L</code> archaeology.
      </>
    ),
    answerText:
      "Yes, that's the whole point of the Ports popover. Type the remote port, leave the local port blank, and hit Enter; lpm opens the forward and shows the success toast only once the local address actually answers, so you know the tunnel is usable, not just started. Declared service ports forward automatically as soon as the remote server listens, and other ports lpm spots on the remote show up as one-click suggestions: remote port forwarding without the ssh -L archaeology.",
  },
  {
    question: "Does lpm work with a jump host or bastion?",
    answer: (
      <>
        Yes, when the jump host is part of the selected{" "}
        <code className="text-xs">Host</code> entry in your OpenSSH config. lpm
        saves the host alias and invokes OpenSSH with it, so options such as{" "}
        <code className="text-xs">ProxyJump bastion</code> or{" "}
        <code className="text-xs">ProxyCommand</code> remain in OpenSSH&apos;s
        hands. The first connection prompts for whatever your bastion requires
        (key passphrase, 2FA); lpm keeps that connection open after that, so
        later services, actions, and terminals can reuse it.
      </>
    ),
    answerText:
      "Yes, when the jump host is part of the selected Host entry in your OpenSSH config. lpm saves the host alias and invokes OpenSSH with it, so options such as ProxyJump bastion or ProxyCommand remain in OpenSSH's hands. The first connection prompts for whatever your bastion requires (key passphrase, 2FA); lpm keeps that connection open after that, so later services, actions, and terminals can reuse it.",
  },
  {
    question: "Can actions run on the remote host, or locally against remote files?",
    answer:
      "Both. On an SSH project, actions run on the remote host by default, which suits a deploy, a migration, or a remote build. A setting in the project config lets an individual action run on your Mac instead: lpm copies the remote folder down, runs the command locally, and pushes the changes back, so a local formatter or an AI coding session can work on remote source without you shuttling files. That option needs rsync.",
  },
  {
    question: "Do Claude Code and Codex on the remote box show up in lpm?",
    answer:
      "Yes. When you open a terminal on an SSH project, lpm sets up its agent status and skills on the server, so Claude Code and Codex running there report working, needs you, and done to your Mac's sidebar and trigger the same sounds and banners as local agents. If a gateway host sends terminals to a different machine than lpm's connection, lpm warns you that alerts from that server won't arrive.",
  },
  {
    question: "What happens when the SSH connection drops?",
    answer:
      "lpm sends keepalives, so a dead link is noticed quickly, and SSH terminals reconnect on their own, backing off between attempts. A reconnect starts a fresh remote shell, so whatever that session was running is not resumed. Remote processes also live only as long as the connection; to keep projects and agents running while your Mac sleeps, install lpm on the server as a Linux host.",
  },
  {
    question: "Can I duplicate an SSH project or make a worktree of it?",
    answer:
      "Not yet. Duplicate and New Worktree aren't available for SSH projects, and services are not auto-detected for SSH projects: a new one starts with a single login-shell service that you edit in the config editor.",
  },
  {
    question: "Is lpm a good iTerm2 or Warp alternative for SSH work specifically?",
    answer: (
      <>
        Both iTerm2 and Warp are capable Mac terminals, and raw{" "}
        <code className="text-xs">ssh</code> inside either can use your OpenSSH
        config. lpm is different because it adds a project model around the SSH
        session itself: a host picker reading{" "}
        <code className="text-xs">~/.ssh/config</code>, remote services streaming
        into project panes, port forwarding with readiness checks, remote port
        suggestions, and per-project lifecycle for forwards. If your day is
        mostly local terminal work with the occasional{" "}
        <code className="text-xs">ssh user@host</code>, a general terminal is
        fine. If you cross the local/remote line every hour, lpm is built for
        that workflow.
      </>
    ),
    answerText:
      "Both iTerm2 and Warp are capable Mac terminals, and raw ssh inside either can use your OpenSSH config. lpm is different because it adds a project model around the SSH session itself: a host picker reading ~/.ssh/config, remote services streaming into project panes, port forwarding with readiness checks, remote port suggestions, and per-project lifecycle for forwards. If your day is mostly local terminal work with the occasional ssh user@host, a general terminal is fine. If you cross the local/remote line every hour, lpm is built for that workflow.",
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
          title="What Mac developers ask before using lpm as their SSH terminal"
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
