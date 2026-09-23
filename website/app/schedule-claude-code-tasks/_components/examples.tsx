import { Fragment } from "react";
import { SectionHeader } from "@/components/section-header";
import { EXAMPLES } from "./examples-data";

function keepTokensWhole(command: string) {
  return command.split(" ").map((token, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span className="whitespace-nowrap">{token}</span>
    </Fragment>
  ));
}

export default function Examples() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Ideas to steal"
          title="Jobs worth putting on a schedule"
          description="Real setups you can build in the editor today. Copy a prompt, pick a schedule, and read the result with your coffee."
          className="mb-12"
        />
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {EXAMPLES.map((job) => (
            <li
              key={job.title}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-base dark:bg-white/[0.06]"
                >
                  {job.emoji}
                </span>
                <h3 className="min-w-0 flex-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {job.title}
                </h3>
                <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {job.kind}
                </span>
              </div>
              <p
                className={`mt-4 rounded-xl bg-gray-50 px-4 py-3 leading-relaxed text-gray-700 dark:bg-white/[0.04] dark:text-gray-300 ${
                  job.mono ? "text-balance font-mono text-[12.5px]" : "text-sm"
                }`}
              >
                {job.mono ? keepTokensWhole(job.task) : job.task}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {job.details.map(({ label, value, mono }) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
                    <dd
                      className={`min-w-0 text-gray-800 dark:text-gray-200 ${
                        mono ? "text-balance font-mono text-[12.5px]" : ""
                      }`}
                    >
                      {mono ? keepTokensWhole(value) : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
