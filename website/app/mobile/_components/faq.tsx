import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Do I need lpm on my Mac to use the iOS app?",
    answer:
      "Yes. The iOS app is a companion, not a standalone terminal. Every project, service, and AI agent runs on your Mac inside lpm — the phone is a live display and input client that pairs with it. Install lpm on your Mac first, then pair your iPhone or iPad.",
  },
  {
    question: "Can I prompt Claude Code and Codex from my phone?",
    answer:
      "Yes. Each terminal has a full prompt composer: type or dictate a prompt, run an AI rewrite and pick from variants, use slash commands for the agent in that terminal, @-mention changed files, branches, terminal output, or service logs, and attach images. Your prompt goes to the real agent session running on your Mac.",
  },
  {
    question: "Can I review a git diff and commit or push from my phone?",
    answer:
      "Yes. A full review screen shows inline diffs of every changed file with add and delete stats, and it refreshes as the agent keeps editing. You can select files and commit with an AI-generated message, then pull, push, fetch, switch branches, or open a GitHub pull request with an AI-drafted title and body — all from the phone.",
  },
  {
    question: "Will I get a notification when Claude Code finishes or is waiting?",
    answer:
      "Yes. Even with the app closed, you get a push the moment an agent is waiting on you, finishes, or hits an error, with a separate on/off toggle for each kind. Tapping the notification deep-links straight to the project, and it withdraws itself if you handle the agent on your Mac instead.",
  },
  {
    question: "Does my code or terminal output go through the cloud?",
    answer:
      "No. Terminal output, keystrokes, diffs, and files all travel directly between your phone and your Mac — there is no server in the middle for any of it. The only thing that leaves your network is a push notification, and it is end-to-end encrypted with a key only your iPhone holds; the delivery relay sees an opaque blob it cannot read.",
  },
  {
    question: "Can I use it when I'm away from home?",
    answer:
      "Yes. On the same Wi-Fi it works out of the box. Away from your network, put both your Mac and iPhone on a Tailscale tailnet and connect to your Mac's tailnet address for an encrypted link from anywhere. The pairing QR code carries both your local and tailnet addresses, so the app uses whichever it can reach.",
  },
  {
    question: "Is it safe to control my dev machine from my phone?",
    answer:
      "Pairing issues a per-device token that lives only in your iPhone's Keychain; your Mac stores just its hash. By default the connection listens only on your Mac, and you explicitly opt in to reach it over your local network or a tailnet. You can revoke any device from lpm Settings at any time, which immediately drops its connection.",
  },
  {
    question: "Does it work on iPad?",
    answer:
      "Yes. The companion runs on iPhone and iPad, on iOS and iPadOS 17 or later. Both pair with lpm on your Mac the same way — scan the QR code once and you're in.",
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. There is no account and no sign-in. You pair a device by scanning a QR code from lpm's Settings on your Mac (or entering the host and code by hand), and that's it.",
  },
  {
    question: "Does the agent keep running if my phone locks or disconnects?",
    answer:
      "Yes. All the work runs on your Mac. The phone is just a window into it — if it locks, sleeps, or loses the connection, your terminals and agents keep going. Reconnect and you pick up the live stream where it is.",
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
          title="Questions about the lpm iOS companion"
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
