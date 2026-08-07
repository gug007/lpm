import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { vsPath } from "@/lib/links";

const OPTIONS = [
  {
    name: "ssh + tmux",
    keeps:
      "The process alive across a dropped connection — genuinely the core of the problem, and it has been solving it for as long as anyone has run long jobs over SSH.",
    stops:
      "You are still administering a shell. Nothing tracks which services are up or on which port, nothing shows you the diff, nothing tells you an agent went quiet waiting for an answer, and a second server means a second window and a second set of habits.",
  },
  {
    name: "A remote editor session",
    keeps:
      "Files and a terminal on the server, inside the editor you already use.",
    stops:
      "It is built around editing, not around running. Which of the project's services are up, which port each one landed on, and which agent session is waiting on an answer are all still yours to keep track of — and there is no view that puts two servers and your laptop side by side.",
  },
  {
    name: "A rented agent sandbox",
    keeps:
      "A clean machine on demand, with nothing to install and nothing to maintain.",
    stops:
      "It is metered, and rebuilt from a spec, so your caches, your dependencies and your half-finished branch are not there next time. Good for a one-shot task; expensive as a place to actually work.",
  },
];

export default function Alternatives() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="The usual ways"
          title="How people do this today, and where each one stops"
        />

        <div className="space-y-4">
          {OPTIONS.map(({ name, keeps, stops }) => (
            <article
              key={name}
              className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-7 dark:border-gray-800 dark:bg-transparent"
            >
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {name}
              </h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    What it gets right
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {keeps}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    Where it stops
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {stops}
                  </dd>
                </div>
              </dl>
            </article>
          ))}

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-6 sm:p-7 dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              lpm with a Linux host
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              The same survives-the-disconnect property, on a machine you own,
              with the room built around it: the project&rsquo;s services and
              ports, its diffs, its agent status, and as many servers as you
              want — all in the window you already have open on your Mac. What
              lpm is not is a hosting product. It does not rent you a box, and
              it does not know or care where you got yours.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              If the multiplexer comparison is the one you care about, there is{" "}
              <Link
                href={vsPath("tmux")}
                className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
              >
                a longer one against tmux
              </Link>
              .
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
