import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Can Claude Code run on a remote server?",
    answer:
      "Yes. Claude Code is a command-line tool, so it runs on any Linux box you can get a shell on — you sign in on that machine and start it in a terminal there. What a plain SSH session does not give you is the rest of the environment: the project's services, the ports they came up on, the diff of what changed, or any signal on your laptop that the agent is waiting for you. Adding the server to lpm as a Linux host gives you the agent and that context in one window on your Mac.",
  },
  {
    question: "How do I keep Claude Code running when I close my MacBook?",
    answer:
      "Move the run off the MacBook. Anything started on your laptop stops when the laptop sleeps, so the durable answer is to run the agent on a machine that stays awake and treat your Mac as the screen for it. In lpm you add a Linux server under Settings → Connections, start the agent in a terminal on that server, and close the lid — the connection drops, the agent does not. Reopen lpm and it reattaches to the same running session instead of starting a new one.",
  },
  {
    question: "Do I need tmux to keep an agent alive over SSH?",
    answer:
      "No. A terminal you start on a Linux host is owned by lpm on that server, not by your SSH connection, so it survives your Mac disconnecting, sleeping, or quitting — you do not have to remember a multiplexer before every long run. A project's services work the same way: lpm keeps them in its own persistent sessions on the server, so there is no multiplexer to install and nothing to attach to by hand.",
  },
  {
    question:
      "What happens to the agent when my Wi-Fi drops or I change networks?",
    answer:
      "Nothing happens to the agent. The connection between your Mac and the server drops and lpm reconnects on its own within seconds, bringing its SSH tunnel back up first. When it reconnects it replays the recent output of each terminal, so you see what the agent did while you were away. lpm also distinguishes a dead tunnel from a dead server, so you are not sent to look at the wrong machine.",
  },
  {
    question: "Which Linux servers are supported?",
    answer:
      "Debian and Ubuntu on x86_64 (amd64), with systemd. The installer uses apt to pull in what the app needs, and the published bundle is built for amd64 only — ARM servers such as Graviton, Ampere, or a Raspberry Pi are not supported yet. On another systemd distribution you can install the runtime libraries yourself and run the installer with --no-deps on the server, then add the host from your Mac with the install step unticked. The binary is built on current Ubuntu, so an old release may not run it.",
  },
  {
    question: "Do I have to install anything on the server myself?",
    answer:
      "lpm installs itself, including the system packages it needs and a service that restarts it on boot. Your own toolchain is still yours: git, Node, and the agent CLIs you want to run there are not installed for you, because lpm does not guess at your stack. Install them once on the server and every project on it can use them.",
  },
  {
    question:
      "How do I sign into Claude Code or Codex on a server with no browser?",
    answer:
      "Open a terminal on the server from lpm and run the CLI's own sign-in there, the same way you would on any new machine. If a login flow wants a browser callback on the machine itself, put an API key in the server's environment instead — often the better choice for a box you share, and the one that survives the machine being rebuilt.",
  },
  {
    question: "Does my Mac have to stay online for the server to keep working?",
    answer:
      "No. Once a terminal is started on the Linux host, the work belongs to that machine. Your Mac being asleep, offline, or shut down only means nobody is watching. When you come back, lpm reconnects and adopts the sessions that are still alive.",
  },
  {
    question: "Can I connect more than one Linux server?",
    answer:
      "Yes. Add as many as you like — each gets its own section in the sidebar with its own projects, its own connection status, and its own version line, and you can switch between them and your local projects in the same window.",
  },
  {
    question: "Does adding a Linux host expose anything to the internet?",
    answer:
      "No. The server keeps listening only to itself, and lpm reaches it by forwarding that port over the SSH connection you already had, so no new port is opened and no firewall rule changes. The pairing secret travels over that same SSH channel, and the server's certificate fingerprint is pinned at pairing — if the identity ever changes, lpm refuses to connect rather than falling back.",
  },
  {
    question: "Can I run several agents on one server at the same time?",
    answer:
      "Yes. Open a terminal per agent, or duplicate the project into copies and queue the same prompt in each. Both the copying and the running happen on the server, so a fan-out that would have pinned your laptop's fans costs you nothing locally — the limit is the server's cores and how many diffs you are willing to read.",
  },
  {
    question: "Do Linux host projects show up in the lpm iPhone app?",
    answer:
      "No. The iOS app pairs with lpm on your Mac and shows the projects on that Mac. Projects that live on a Linux host are not in that list today.",
  },
  {
    question: "How much does a VPS for running Claude Code cost?",
    answer:
      "Roughly €5 to €12 a month, depending on the provider, for the 2 GB box that comfortably runs lpm plus a project's services. A spare desktop, a home server, or an old workstation on your own network does the same job for the price of the electricity — lpm does not care where the machine came from, only that you can SSH into it as root.",
  },
  {
    question: "Is there a Linux version of the lpm app?",
    answer:
      "Not as a desktop app. The interface is macOS-only and that is where you sit; Linux is supported as a host — the same lpm runs there without a screen and is driven from your Mac. If you work primarily on Linux, this is not the tool for you yet.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Running agents on a server, answered"
        />
        <ul className="space-y-3">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden dark:text-gray-100">
                  <span>{question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
