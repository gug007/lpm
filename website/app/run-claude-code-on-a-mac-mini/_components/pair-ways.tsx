import { ClipboardPaste, Grip, Keyboard, Lock, Wifi } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const WAYS = [
  {
    icon: Wifi,
    title: "Tap it nearby",
    body: "On the same network, click Connect next to the Mac mini, check that both screens show the same 6-digit code, and accept on the Mac mini.",
  },
  {
    icon: ClipboardPaste,
    title: "Paste an invite",
    body: "On the Mac mini, choose Add a Mac → Create invite and copy it. Paste it on your laptop and click Connect. An invite works once.",
  },
  {
    icon: Keyboard,
    title: "Type the address and code",
    body: "Open Enter details manually and type what an invite holds: the Mac mini's address, port 8766, and the code shown under the invite.",
  },
];

const NOTES = [
  {
    icon: Grip,
    title: "Away from home",
    body: "Set up Built-in Tailscale under + above your projects → Another computer on both Macs, with the same Tailscale account, and your laptop reaches the Mac mini's sessions from anywhere. No Tailscale app needed (macOS 12 or newer).",
  },
  {
    icon: Lock,
    title: "Direct and encrypted",
    body: "The two Macs talk directly over TLS pinned to the Mac mini's own certificate, not through a relay of ours, and the Mac mini keeps only a hash of each device's token.",
  },
];

export default function PairWays() {
  return (
    <section id="pair" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Pairing"
          title="Pair the Mac mini once"
          description="Install lpm on both Macs. On the Mac mini, click + above your projects, choose Another computer and turn on Allow control of this Mac. Then, on your laptop, click + above your projects and choose Another computer."
        />

        <div className="grid gap-4 md:grid-cols-3">
          {WAYS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 dark:border-gray-800 dark:bg-white/[0.02]"
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

        <ul className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-2">
          {NOTES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 p-2">
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                aria-hidden
              />
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
