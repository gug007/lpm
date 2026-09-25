import { SectionHeader } from "@/components/section-header";
import StatsExplorer from "./stats-explorer";

const EXPLAINERS = [
  {
    title: "Why are token counts so high? Cache reads.",
    body: "Every turn re-sends the conversation so far, and most of it comes back from the prompt cache. Stats counts those cache reads as input, which is why the Input tile often shows 95% or more from cache. Cache reads are priced at a small fraction of fresh input, so a huge total can sit next to a much smaller cost estimate.",
  },
  {
    title: "Is the cost estimate my bill?",
    body: "No. It's what the tokens would cost at API list prices built into lpm, per model, with cache reads and writes priced separately, and Codex prices are approximate. On Pro, Max or a ChatGPT plan you pay the subscription, not per token. Use it to compare projects and days, not as an invoice.",
  },
];

export default function StatsSection() {
  return (
    <section id="stats" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Token usage"
          title="Claude Code and Codex token usage by project, model and session"
          description="Stats reads the usage fields Claude Code and Codex already save on your Mac and matches each session to the lpm project it ran in, including sessions from other terminals and from before you installed lpm, as long as the files are still on disk."
          className="mb-10 sm:mb-12"
        />

        <figure className="-mx-2 sm:mx-0">
          <div className="mb-3 flex justify-end">
            <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
              Sample data
            </span>
          </div>
          <StatsExplorer />
          <figcaption className="mx-auto mt-4 max-w-2xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Sample data in the layout of lpm&apos;s Stats view. Try it: switch the chart to Share,
            hide Codex, sort projects by sessions, or open a session.
          </figcaption>
        </figure>

        <div className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-2 md:gap-10">
          {EXPLAINERS.map((item) => (
            <div key={item.title}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
