import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { LINUX_HOST_PATH, MOBILE_PATH } from "@/lib/links";

type FaqItem = {
  question: string;
  answer: string;
  link?: { href: string; label: string };
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Do Claude Code and Codex keep running on the Mac mini after my laptop disconnects?",
    answer:
      "Yes. Closing your laptop, letting it sleep or quitting lpm on it only ends the connection: Claude Code and Codex carry on on the Mac mini, which keeps their recent output. When your laptop reconnects, the sidebar marks each finished session done, with how long it worked. If the laptop slept or lost the connection, each terminal carries on from where you left it; after quitting lpm on it, a tab reopens with its recent output on a fresh screen. A session started on the laptop itself still pauses while the laptop is asleep.",
  },
  {
    question: "Whose Claude Code and Codex account, and usage limits, does it use?",
    answer:
      "The Mac mini's. Sessions run with the Claude Code and Codex installed and signed in on the Mac mini, so those accounts do the work and their usage limits are the ones spent. From your laptop, right-click the Mac mini in the sidebar and choose Settings on Mac mini… to add its Claude accounts or sign one in; the sign-in runs in a terminal on the Mac mini. When the same Claude account is signed in on both Macs, lpm passes its usage-limit readings between them, so each shows the latest.",
  },
  {
    question: "Can I answer Claude Code from my phone?",
    answer:
      "Yes, with lpm Link on iPhone or iPad. Right-click the Mac mini in your laptop's sidebar, choose Pair a phone…, and scan the code. The phone then connects to the Mac mini directly, over your home network or Tailscale, so it can tell you a session needs you and let you type the answer with your laptop shut. A phone paired only with your laptop can also open the Mac mini through it while the laptop is awake.",
    link: { href: MOBILE_PATH, label: "More on lpm Link" },
  },
  {
    question: "What happens to a Codex session if the Mac mini sleeps or restarts?",
    answer:
      "If the Mac mini sleeps, Codex pauses with everything else on it until it wakes, and your laptop shows the Mac mini as not responding. If it restarts, or lpm quits or updates there, Codex stops mid-task; when you open the project again, its tab resumes the conversation, so you can ask it to carry on. lpm doesn't relaunch on its own, so keep the Mac mini plugged in with Keep this Mac awake on, add lpm to Login Items, and turn on Start up automatically after a power failure.",
  },
  {
    question: "Can I run several Claude Code sessions on the Mac mini?",
    answer:
      "Yes. Start several Claude Code and Codex tabs, in one Mac mini project or across its projects, and split a tab to watch two side by side. They all run on the Mac mini's CPU and memory, and your laptop's sidebar lists each one under its project with what it is doing and for how long.",
  },
  {
    question: "Does it work when I'm away from home?",
    answer:
      "Yes, over Tailscale. Set up Built-in Tailscale under + above your projects → Another computer on both Macs with the same Tailscale account, or use the Tailscale app. Invites carry the Mac mini's Tailscale address next to its home one, and a laptop that left home tries the address that worked last. Without Tailscale, your laptop reaches the Mac mini's sessions only on the same network.",
  },
  {
    question: "Can I use a Windows PC or my old MacBook instead of a Mac mini?",
    answer:
      "Yes. Any Mac or PC running lpm can run your Claude Code and Codex sessions, including a Windows PC or a Linux desktop; on Windows, turning on Allow control asks for a firewall permission the first time. An old MacBook works too if it stays plugged in with its lid open: Keep this Mac awake holds only on power, and closing a laptop's lid still puts it to sleep.",
  },
  {
    question: "Is the connection between my laptop and the Mac mini encrypted?",
    answer:
      "Yes, when both run a current lpm. The link is TLS, pinned to the Mac mini's own certificate: an invite carries its fingerprint, so it is checked from the first connection, and a different machine at the same address is refused. The two talk directly rather than through a relay of ours, the Mac mini keeps only a hash of each device's token, and you can remove any device's access under + above your projects → Another computer.",
  },
  {
    question: "Mac mini or a Linux VPS for Claude Code?",
    answer:
      "Use the machine you have. A Mac mini you own costs nothing more and is also a desktop you can sit at, but it has to stay awake with lpm open, and you add lpm to Login Items yourself. A Linux VPS never sleeps and lpm starts there on boot, but it is one more machine to rent, and it has to be x86_64. Either way, you start and answer Claude Code and Codex from your laptop's sidebar.",
    link: { href: LINUX_HOST_PATH, label: "Run Claude Code on a Linux server" },
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Claude Code and Codex on a Mac mini, answered"
        />
        <ul className="space-y-3">
          {FAQ_ITEMS.map(({ question, answer, link }) => (
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
                  {link && (
                    <>
                      {" "}
                      <Link
                        href={link.href}
                        className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
                      >
                        {link.label}
                      </Link>
                    </>
                  )}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
