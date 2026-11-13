import Link from "next/link";
import { Laptop, Smartphone } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH } from "@/lib/links";

const WAYS = [
  {
    icon: Smartphone,
    title: "Paired with the Mac mini",
    body: "Right-click the Mac mini in your laptop's sidebar, choose Pair a phone…, and scan the code with lpm Link. The phone then connects to the Mac mini itself, gets its notifications, and lets you type an answer to Claude Code or Codex with your laptop shut.",
  },
  {
    icon: Laptop,
    title: "Through your laptop",
    body: "A phone paired only with your laptop can open the Mac mini through it, with nothing more to set up, for as long as the laptop is awake and connected. The Mac mini's notifications reach only phones paired with it.",
  },
];

export default function Phone() {
  return (
    <section id="phone" className="scroll-mt-20 py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="On your phone"
          title="Answer Claude Code from your iPhone, laptop shut"
          description="lpm Link, the lpm app for iPhone, iPad and Android, shows the Mac mini's Claude Code and Codex sessions, tells you when one needs you or finishes, and lets you reply in its terminal."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {WAYS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-transparent"
            >
              <Icon
                className="h-5 w-5 text-gray-500 dark:text-gray-400"
                aria-hidden
              />
              <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          The phone needs a way to reach the Mac mini: your home network, or
          Tailscale when you are out. More on{" "}
          <Link
            href={MOBILE_PATH}
            className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
          >
            lpm Link
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
