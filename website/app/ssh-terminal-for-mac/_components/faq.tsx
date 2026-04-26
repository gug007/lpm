import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Does lpm replace Termius as my SSH client on Mac?",
    answer:
      "For developers who want their terminal to handle remote work alongside local services, yes — lpm imports `~/.ssh/config` directly (no separate host vault), runs remote services in panes next to your local ones, and forwards ports without leaving the window. If you specifically need a saved-snippet library or an SFTP file browser, Termius still does those things; lpm is a terminal-first SSH workspace, not a feature-parity Termius alternative on Mac. For most remote-dev workflows, the terminal-first approach replaces the dedicated client entirely.",
  },
  {
    question: "How does lpm import my `~/.ssh/config`?",
    answer:
      "When you add an SSH project, lpm reads `~/.ssh/config` (and any files referenced by `Include` directives, up to four levels deep), parses out the non-wildcard `Host` blocks, and shows them in a dropdown. Pick any host from `~/.ssh/config` and lpm pre-fills the host alias, user, port, and identity file in the form. lpm connects through that Host alias, so OpenSSH can still apply alias-scoped options such as `HostName`, `ProxyJump`, and `ProxyCommand`. The config import is one read, and your `~/.ssh/config` stays the source of truth.",
  },
  {
    question: "Can I forward a remote port to localhost without typing `ssh -L`?",
    answer:
      "Yes — that's the whole point of the Ports popover. Type the remote port, leave the local port blank, hit Enter; lpm spawns the forward, polls `localhost:<port>` until something actually accepts a connection, and only then surfaces the success toast. So you know the tunnel is usable, not just spawned. Declared service ports auto-forward at start, and ad-hoc binds discovered on the remote surface as one-click suggestions — remote port forwarding without the `ssh -L` archaeology.",
  },
  {
    question: "Does lpm work with a jump host or bastion (`ProxyJump`)?",
    answer:
      "Yes, when the jump host is part of the selected `Host` entry in your OpenSSH config. lpm saves the Host alias and invokes OpenSSH with that alias, so options such as `ProxyJump bastion` or `ProxyCommand` remain in OpenSSH's hands. The first connection prompts for whatever your bastion requires (key passphrase, 2FA); the multiplexed channel keeps it open after that, so later services, actions, and terminals can reuse it.",
  },
  {
    question: "What's the difference between `mode: remote` and `mode: sync` for actions?",
    answer:
      "This is the ssh action mode switch on each action. `mode: remote` (the default for SSH projects) runs the action's command on the remote host over ssh — useful for a deploy, a migration, a remote build. `mode: sync` rsyncs the remote source tree into a local mirror, runs the action locally against the mirror, and pushes changes back — so a local tool (a code formatter, an IDE refactor, an AI coding session) can act on remote source without you shuttling files manually. Each action picks its mode independently.",
  },
  {
    question: "Is lpm a good iTerm2 or Warp alternative for SSH work specifically?",
    answer:
      "Both iTerm2 and Warp are capable Mac terminals, and raw `ssh` inside either can use your OpenSSH config. lpm is different because it adds a project model around the SSH session itself: a host picker reading `~/.ssh/config`, remote services in panes beside local ones, port forwarding with readiness checks, remote port suggestions, and per-project lifecycle for forwards. If your day is mostly local terminal work with the occasional `ssh user@host`, a general terminal is fine. If you cross the local/remote line every hour, lpm is built for that workflow.",
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
          title="What Mac developers ask before using lpm as their SSH terminal"
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
