import { SectionHeader } from "@/components/section-header";

const STEPS = [
  {
    number: "01",
    title: "Run agents in a configured project",
    body: "Use Claude Code or Codex as usual. lpm matches each local session to the configured project root where it ran.",
  },
  {
    number: "02",
    title: "Read local usage metadata",
    body: "lpm finds token and model metadata in the agents’ local session histories and groups it without adding prompts or responses to the dashboard.",
  },
  {
    number: "03",
    title: "Explore the dashboard",
    body: "Switch from today to all time, compare providers, sort projects, and inspect recent sessions whenever you need context.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Automatic by design"
          title="No spreadsheets. No manual tracking."
          description="Your existing local agent histories already contain the usage metadata. lpm turns it into a useful project view."
          className="mb-12"
        />
        <ol className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number} className="relative border-t border-gray-200 pt-6 dark:border-gray-800">
              <span className="font-mono text-xs font-semibold text-gray-400 dark:text-gray-600">
                {step.number}
              </span>
              <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
