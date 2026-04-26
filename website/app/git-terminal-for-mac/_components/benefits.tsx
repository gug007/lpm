import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "You stop losing your dev server every time you switch branches.",
    body: "Services run in their own panes, independent of which branch your shell is on. Your npm run dev keeps streaming while you rebase, resolve conflicts, and push.",
  },
  {
    title: "You stop toggling between a GUI git client and a terminal.",
    body: "One lpm window has a shell pane for git commands and service panes for your running stack. The branch graph GUI is for people who don't want to type — you do want to type, you just don't want to leave your running services to do it.",
  },
  {
    title: "Context switching between repos stops wiping your git state.",
    body: "Jump to another project, fix a blocking bug, push it — your original project is still on its branch, with its services up, with its terminal history intact. Come back and keep rebasing.",
  },
  {
    title: "Starting fresh after a big merge is one click, not a script.",
    body: "After pulling a release branch or merging a long-running feature, lpm restarts the full defined stack in order. No mental dependency graph, no --force-recreate flags typed from memory.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The git workflow difference"
          title="What git feels like when your terminal is built for it"
          description="Four concrete improvements to your daily git workflow."
        />
        <ol className="space-y-10">
          {OUTCOMES.map(({ title, body }, i) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] gap-x-6 sm:gap-x-8 items-start"
            >
              <span
                aria-hidden="true"
                className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {title}
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
