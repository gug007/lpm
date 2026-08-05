type Step = { call: string; result: string };

type Exchange = {
  query: string;
  steps: Step[];
  answer?: string;
};

const EXCHANGES: Exchange[] = [
  {
    query: "why do refunds re-enter the queue on a retry?",
    steps: [
      { call: "Read(packages/api/refunds.ts)", result: "212 lines" },
      { call: "Grep(refundIntent)", result: "6 matches" },
      { call: "Edit(packages/api/refunds.ts)", result: "+34 -6" },
    ],
    answer:
      "The webhook guard only covers the first attempt, so a retry enqueues the same intent twice. Added a dedupe key on the intent id.",
  },
  {
    query: "add a test for the retried webhook",
    steps: [{ call: "Bash(pnpm test packages/api)", result: "24 passed in 3.1s" }],
  },
];

/** The Claude Code tab of the selected project, sitting finished and idle. */
export function ShowcaseSession() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1a1a1a] px-3 py-2 pr-10 font-mono text-[10px] leading-relaxed text-gray-100 sm:text-[11px] lg:pr-3">
      <p className="whitespace-pre text-emerald-400">$ claude</p>
      <p className="mt-2 whitespace-pre text-fuchsia-300">
        <span className="mr-2">✻</span>Welcome to Claude Code!
      </p>
      <p className="mt-1 whitespace-pre pl-4 text-gray-400">
        /help for help · /status for your setup
      </p>
      <p className="whitespace-pre pl-4 text-gray-400">
        cwd: ~/Projects/checkout
      </p>
      <p className="mt-1 whitespace-pre pl-2 text-gray-500">
        ※ Tip: lpm launched Claude in this project&apos;s root
      </p>

      {EXCHANGES.map(({ query, steps, answer }) => (
        <div key={query} className="mt-3">
          <p className="flex gap-2">
            <span className="text-fuchsia-300">&gt;</span>
            <span className="text-gray-100">{query}</span>
          </p>
          <div className="mt-1 space-y-1 pl-4">
            <p className="text-fuchsia-300">
              <span className="inline-block w-3">✓</span>
              <span className="ml-1">Thinking…</span>
            </p>
            {steps.map(({ call, result }) => (
              <div key={call}>
                <p className="truncate">
                  <span className="text-fuchsia-300">●</span>
                  <span className="ml-1.5 text-gray-200">{call}</span>
                </p>
                <p className="truncate pl-5 text-gray-500">⎿ {result}</p>
              </div>
            ))}
            {answer && <p className="pt-1 text-gray-300">{answer}</p>}
          </div>
        </div>
      ))}

      <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#1a1a1a] lg:hidden" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#1a1a1a]" />
    </div>
  );
}
