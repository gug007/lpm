import { SectionHeader } from "@/components/section-header";
import { PANE_ITEMS } from "./skills-data";

export default function ToolkitOverview() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="The Skills & tools pane"
          title="Skills are one tab of a bigger picture"
          description="The pane that creates skills also shows everything else Claude Code and Codex will load in that folder, and what it costs."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PANE_ITEMS.map(({ icon: Icon, title, copy }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#151515]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-base font-bold text-gray-950 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {copy}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
