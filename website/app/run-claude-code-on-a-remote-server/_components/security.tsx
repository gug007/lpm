import { Fingerprint, KeyRound, Lock, Undo2 } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const POINTS = [
  {
    icon: Lock,
    title: "The server doesn't listen to the network",
    body: "The port lpm listens on there is bound to the machine itself, reachable from nowhere else. lpm gets to it by forwarding that port over SSH — the access you already had — so adding a host opens nothing new to the internet and needs no firewall change.",
  },
  {
    icon: KeyRound,
    title: "The pairing secret rides the SSH channel",
    body: "lpm asks the server for a single-use invite over SSH and consumes it over its own forward. Nothing is emailed, pasted, or left on a clipboard, and the server stores only a hash of the token it issued.",
  },
  {
    icon: Fingerprint,
    title: "The identity is pinned",
    body: "Pairing records the server's certificate fingerprint. Every later connection is checked against it: if the identity ever changes, lpm says so and refuses rather than quietly connecting to something else.",
  },
  {
    icon: Undo2,
    title: "Nothing you have to undo",
    body: "Nothing new reachable from the network, no account, no relay in the middle, no service of ours holding your keys. Disconnect a host and it drops out of your sidebar — whatever is running on it keeps running.",
  },
];

export default function Security() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="What it opens up"
          title="Nothing, is the answer"
          description="A server you rent has no business exposing a control port to the world, so lpm doesn't ask it to."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, title, body }) => (
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
      </div>
    </section>
  );
}
