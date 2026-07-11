import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

type Beat = {
  step: string;
  body: React.ReactNode;
};

const BEATS: Beat[] = [
  {
    step: "Fan out",
    body: (
      <>
        <code className="font-mono text-xs">lpm duplicate -n 3</code> makes three
        real, standalone copies of the project — a fast copy-on-write clone on
        Apple&rsquo;s filesystem — groups them together in the sidebar, and
        queues the same agent and prompt in each.
      </>
    ),
  },
  {
    step: "Let them race",
    body: (
      <>
        Three agents attack the same task in parallel, each in its own copy with
        its own services and ports.{" "}
        <code className="font-mono text-xs">lpm wait --agent -p &lt;copy&gt;</code>{" "}
        blocks on each copy until its agent has finished — no polling loops.
      </>
    ),
  },
  {
    step: "Keep the best, clean up",
    body: (
      <>
        Compare the results, keep the copy you like, and{" "}
        <code className="font-mono text-xs">lpm remove</code> tidies up the
        rest. Copies are ordinary folders — nothing to unwind, no shared state
        to untangle.
      </>
    ),
  },
];

export default function Parallel() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Parallel agents"
          title="Run three agents on the same task at once"
          description="Duplicate is the fan-out primitive — spin up to 50 standalone copies, each running the same prompt, and pick the winner."
        />

        <CodeBlock filename="Fan out and wait">
          <Comment># Clone into 3 copies, pull latest, and run the same prompt in each</Comment>
          {"\n"}lpm duplicate -n 3 --run claude \
          {"\n"}  --prompt &quot;make the checkout flow pass its tests&quot;
          {"\n\n"}
          <Comment># Block until a copy&apos;s agent settles</Comment>
          {"\n"}lpm wait --agent -p myapp-copy-1
          {"\n\n"}
          <Comment># Keep the winner, remove the rest</Comment>
          {"\n"}lpm remove myapp-copy-2
        </CodeBlock>

        <ol className="mt-10 space-y-8">
          {BEATS.map(({ step, body }, i) => (
            <li
              key={step}
              className="grid grid-cols-[auto_1fr] gap-x-6 items-start"
            >
              <span
                aria-hidden="true"
                className="text-3xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
                  {step}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
