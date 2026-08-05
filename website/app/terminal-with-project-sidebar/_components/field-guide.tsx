import { SectionHeader } from "@/components/section-header";
import { SidebarAnatomy } from "./sidebar-anatomy";

const ENTRIES: { n: number; term: string; body: string }[] = [
  {
    n: 1,
    term: "Folders",
    body: "Group related projects one level deep. They are called folders in the UI, they collapse, and you drag projects and folders into the order you want. Folders do not nest inside folders — the list stays a list.",
  },
  {
    n: 2,
    term: "A copy or a Git worktree",
    body: "Duplicate a project, or create a worktree from it, and the new one is listed directly beneath its parent. Its name is muted because it is inherited from the parent, and its tooltip names the project it came from.",
  },
  {
    n: 3,
    term: "Running state",
    body: "One dot per project. Filled green means something is running, hollow means nothing is, and red means that project's config has an error — hover the row and the tooltip names the problem. That is the entire vocabulary — no per-service dots, service counts, port numbers, or readiness checks live in the sidebar.",
  },
  {
    n: 4,
    term: "Agent attention",
    body: "Claude Code and Codex report back into the row: the name shimmers while an agent is working, turns amber when it needs an answer from you, turns red with an alert icon on an error, and turns blue with a check when it finishes. Other agents run fine in a terminal, but they do not light up the row.",
  },
  {
    n: 5,
    term: "Paired Macs and hosts",
    body: "A Mac you have paired appears as its own section under your local projects, headed by that machine's name. Its rows open the same project view your local rows do.",
  },
  {
    n: 6,
    term: "Width and collapse",
    body: "Drag the divider anywhere between 160 and 400 px; the default is 260 px and your width is remembered. ⌘B collapses the sidebar out of the way when you want the terminals full-width — that collapsed state is not remembered between launches, so a fresh window always starts with the sidebar showing.",
  },
];

export default function FieldGuide() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Field guide"
          title="What a row can tell you"
          description="Six things the sidebar communicates, and the deliberate limits on each. Everything below is what the row actually shows — nothing here is aspirational."
          className="mb-12"
        />
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-14">
          <div className="flex justify-center lg:sticky lg:top-24 lg:justify-start">
            <SidebarAnatomy />
          </div>
          <dl className="space-y-6">
            {ENTRIES.map(({ n, term, body }) => (
              <div key={term} className="flex gap-4">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white tabular-nums dark:bg-white dark:text-gray-900">
                  {n}
                </span>
                <div className="min-w-0">
                  <dt className="font-semibold text-gray-900 dark:text-gray-100">
                    {term}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {body}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
