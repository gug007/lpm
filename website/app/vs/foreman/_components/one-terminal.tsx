import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

type Card = {
  title: string;
  seen?: string;
  fix: ReactNode;
};

const CARDS: Card[] = [
  {
    title: "The CSS watcher dies and takes Rails with it",
    seen: "One process exits and the whole formation shuts down mid-request.",
    fix: (
      <>
        In lpm each service is its own pane; nothing stops the siblings when one
        exits, and you bring that one back from the project&apos;s Services menu
        or with{" "}
        <code className="font-mono text-[13px]">lpm service css restart</code>.
        Overmind restarts one too — that is what it exists for — though there a
        dying process interrupts the rest unless you list it under{" "}
        <code className="font-mono text-[13px]">-c</code>.
      </>
    ),
  },
  {
    title: "Closing the window ends your stack",
    fix: "lpm's services run outside the app, so quitting it leaves the dev servers up and relaunching finds them again. Overmind's tmux session detaches and keeps going; a foreman formation ends with the command that started it.",
  },
  {
    title: "Address already in use, and you do not know who",
    fix: "lpm checks the ports your services declare before it starts, names the process holding one, and offers to free it or stop the start.",
  },
  {
    title: "Postgres has to be up before the worker",
    fix: (
      <>
        <code className="font-mono text-[13px]">dependsOn: [db]</code> gives a
        real start order, with a clear error instead of a hang if you write a
        cycle. It orders starts;{" "}
        <code className="font-mono text-[13px]">lpm wait --port 5432</code> is
        the readiness gate.
      </>
    ),
  },
];

export function OneTerminal() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Why people leave foreman start"
          title="Four things that happen in one terminal"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <h3 className="font-semibold leading-snug text-gray-900 dark:text-gray-100">
                {card.title}
              </h3>
              {card.seen && (
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {card.seen}
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {card.fix}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
