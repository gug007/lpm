import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Verdict = {
  supported: boolean;
  note?: ReactNode;
};

type LifetimeRow = {
  term: string;
  lpm: Verdict;
  pm2: Verdict;
};

const ROWS: LifetimeRow[] = [
  {
    term: "Survives closing the app",
    lpm: { supported: true },
    pm2: { supported: true },
  },
  {
    term: "Survives a reboot",
    lpm: {
      supported: false,
      note: (
        <>
          no equivalent to <code className="font-mono">pm2 startup</code> and{" "}
          <code className="font-mono">pm2 save</code>; you start the project
          again
        </>
      ),
    },
    pm2: { supported: true },
  },
  {
    term: "Survives a crash",
    lpm: {
      supported: false,
      note: "the service stays down; its pane keeps the last output and the exit code",
    },
    pm2: { supported: true, note: "with backoff" },
  },
];

function Mark({ supported }: { supported: boolean }) {
  return supported ? (
    <>
      <Check
        aria-hidden="true"
        className="w-4 h-4 shrink-0 text-gray-900 dark:text-white"
      />
      <span className="sr-only">Yes</span>
    </>
  ) : (
    <>
      <X
        aria-hidden="true"
        className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
      />
      <span className="sr-only">No</span>
    </>
  );
}

export function SurvivesQuit() {
  return (
    <section id="survives-quit" className="py-16 sm:py-20 scroll-mt-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Process lifetime"
          title="Close the app. Your dev servers keep running."
          description={
            <>
              The reason people reach for PM2 locally is that a dev server tied
              to a terminal window dies with the window. lpm&apos;s services do
              not run in the app — they run outside it, so quitting lpm is not{" "}
              <code className="font-mono">pm2 stop</code>. Relaunch and every
              pane is still there, still labelled, still streaming.
            </>
          }
        />

        <dl className="space-y-3">
          {ROWS.map((row) => (
            <div
              key={row.term}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <dt className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.02] px-4 py-3 sm:px-5 text-sm font-medium text-gray-900 dark:text-gray-100">
                {row.term}
              </dt>
              <dd className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-800">
                {[
                  { name: "lpm", verdict: row.lpm, highlight: true },
                  { name: "PM2", verdict: row.pm2, highlight: false },
                ].map((col) => (
                  <div
                    key={col.name}
                    className={`px-4 py-3 sm:px-5 ${
                      col.highlight ? "bg-gray-100/70 dark:bg-white/[0.04]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mark supported={col.verdict.supported} />
                      <span
                        className={`text-xs font-semibold uppercase tracking-widest ${
                          col.highlight
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {col.name}
                      </span>
                    </div>
                    {col.verdict.note && (
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {col.verdict.note}
                      </p>
                    )}
                  </div>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Two of those three go to PM2. That is the honest shape of this
          comparison — lpm is built for the loop you are in, not the box you left
          running.
        </p>
      </div>
    </section>
  );
}
