import { SectionHeader } from "@/components/section-header";

const STEPS = [
  {
    number: "01",
    title: "Run agents in your projects",
    body: "Use Claude Code or Codex as usual in a project you have added to lpm. Each session is matched to the project folder it ran in.",
  },
  {
    number: "02",
    title: "Open Stats or Usage",
    body: "Both sit in the More menu at the bottom of the sidebar: Stats for tokens and cost, Usage for plan limits. Move either into the sidebar if you check it often.",
  },
  {
    number: "03",
    title: "Read the answer you need",
    body: "Switch ranges, compare providers, sort projects, and open recent sessions, or glance at the sidebar meter to see how much of your plan is left.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Automatic by design"
          title="No spreadsheets. No manual tracking."
          description="The agents already record what they use. lpm turns that into a project view and a live limit meter."
          className="mb-12"
        />
        <ol className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number} className="relative border-t border-gray-200 pt-6 dark:border-gray-800">
              <span className="font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">
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
