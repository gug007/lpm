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
      "Yes. The iOS app is a companion, not a standalone terminal. Every project, service, and AI agent runs on your Mac inside lpm — the phone is a live display and input client that pairs with it. Install lpm on your Mac first, then pair your iPhone.",
  },
  {
    question: "Does my code or terminal output go through the cloud?",
    answer:
      "No. The phone connects directly to lpm running on your Mac over your own network. There is no lpm server in the middle. Terminal output, keystrokes, and project data never pass through a third-party service.",
  },
  {
    question: "Can I use it when I'm away from home?",
    answer:
      "Yes. On the same Wi-Fi it works out of the box. Away from your network, put both your Mac and iPhone on a Tailscale tailnet and connect to your Mac's tailnet address — that gives you an encrypted link from anywhere. Native TLS is a planned follow-up.",
  },
  {
    question: "Is it safe to control my dev machine from my phone?",
    answer:
      "Pairing issues a per-device token that lives only in your iPhone's Keychain; your Mac stores just its hash. By default the server listens only on your Mac, and you explicitly opt in to reach it over your local network or a tailnet. You can revoke any device from lpm Settings at any time, which immediately drops its connection.",
  },
  {
    question: "What can I actually do from the phone?",
    answer:
      "Watch any terminal stream live with full scrollback, type into a running session, answer or correct an AI agent, start and stop projects, toggle individual services, run saved actions, open new terminals, and send an image from your phone into a terminal's composer. You also see when an agent flips to Waiting so you know the moment it needs you.",
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
