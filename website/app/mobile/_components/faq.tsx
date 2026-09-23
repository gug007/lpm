import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: string;
};

const FAQS: QA[] = [
  {
    question: "Do I need lpm on my Mac to use the iPhone app?",
    answer:
      "Yes. lpm Link is a companion, not a standalone terminal. Every project, service, and AI agent runs in lpm on a Mac, or on a Linux server set up as an lpm host, and the phone is a live display and input client for it. You can pair several machines and switch between them in the app.",
  },
  {
    question: "How is this different from Claude Code's built-in remote control?",
    answer:
      "They solve overlapping problems from different ends, and they work fine side by side. Claude Code's own remote control keeps a Claude Code session moving from your phone. The lpm companion mirrors the real terminal sessions running on your Mac — full scrollback, and you type into the same session — so it works with whatever agent is in that terminal: Claude Code, Codex, Gemini CLI, or anything else you run there. It also covers the steps around the agent: reviewing the diff, committing, pulling and pushing, opening a pull request, and starting or stopping the project's services. And it pairs straight to your Mac by QR code, with no account to create.",
  },
  {
    question: "Can I prompt Claude Code and Codex from my phone?",
    answer:
      "Yes. Each terminal has a full prompt composer: type a prompt, run an AI rewrite and pick from variants, autocomplete Claude Code and Codex slash commands, @-mention changed files, branches, terminal output, or service logs, and attach images. Your prompt goes to the real agent session running on your Mac, and the draft stays in sync with the same terminal's prompt box there.",
  },
  {
    question: "Can I review a git diff and commit or push from my phone?",
    answer:
      "Yes. A full review screen shows inline diffs of every changed file with add and delete stats, and it refreshes as the agent keeps editing. You can select files and commit with an AI-generated message, then pull, push, fetch, switch branches, or open a GitHub pull request with an AI-drafted title and body — all from the phone.",
  },
  {
    question: "Will I get a notification when Claude Code finishes or is waiting?",
    answer:
      "Yes. Even with the app closed, you get a push the moment an agent is waiting on you, finishes, or hits an error, and automations can notify you when they start, finish, or fail. Each kind has its own on/off switch. Tapping the notification opens that terminal or automation, and it withdraws itself if you handle the agent on your Mac instead.",
  },
  {
    question: "Does my code or terminal output go through the cloud?",
    answer:
      "No. Terminal output, keystrokes, diffs, and files all travel directly between your phone and your Mac — there is no server in the middle for any of it. The only thing that leaves your network is a push notification, encrypted with a per-device key that only your iPhone and your Mac hold; the delivery relay sees an opaque blob it cannot read.",
  },
  {
    question: "Can I use it when I'm away from home?",
    answer:
      "Yes. On the same Wi-Fi it works out of the box. Away from your network, put both your Mac and iPhone on a Tailscale tailnet. With your Mac's tailnet address added to the pairing QR code, the app keeps both addresses and uses whichever one it can reach. lpm has no cloud relay for terminals, so without a tailnet the phone needs another route to your Mac.",
  },
  {
    question: "Is it safe to control my dev machine from my phone?",
    answer:
      "Phone access is off until you turn on Remote control in lpm Settings. Pairing issues a per-device token that lives in your iPhone's Keychain, and your Mac stores just its hash. When Remote control is on, your Mac accepts connections from your network, the app pins your Mac's certificate when you pair, and only paired devices get in. You can revoke any device at any time, which immediately drops its connection.",
  },
  {
    question: "Does it work on iPad?",
    answer:
      "Yes. The companion runs on iPhone and iPad, on iOS and iPadOS 17 or later. Both pair with lpm on your Mac the same way — scan the QR code once and you're in.",
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. There is no account and no sign-in. You pair a device by scanning a QR code from lpm's Settings on your Mac, by tapping a nearby Mac and approving it there, or by entering the address and code by hand.",
  },
  {
    question: "Can I control a Linux server from my phone?",
    answer:
      "Yes. The phone can pair with a Linux host directly instead of going through your Mac: right-click the server's row in the Mac sidebar and pick Pair a phone, or type lpm mobile pair on the server itself and scan the code it shows. From then on it reaches the server on its own, so a closed Mac doesn't matter, and the title menu flips between machines. The phone must be able to reach the server, over your tailnet for example.",
  },
  {
    question: "Can I check my Claude Code usage limits on my phone?",
    answer:
      "Yes. The Usage screen shows how much of your Claude and Codex 5-hour and weekly windows you have used, whether you are ahead of pace, and when each resets. Claude readings need Claude usage turned on in lpm on your Mac. A Stats screen shows token totals and estimated cost by project.",
  },
  {
    question: "Can I create and run automations from my phone?",
    answer:
      "Yes. You can see every automation, run or stop one, pause its schedule, read and reply to its runs, and create or edit one with its agent, model, schedule, and checks. Automations run in lpm on your Mac, so it needs to be on with lpm open.",
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
