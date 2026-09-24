import { SectionHeader } from "@/components/section-header";
import { SidebarAnatomy } from "./sidebar-anatomy";

const ENTRIES: { n: number; term: string; body: string }[] = [
  {
    n: 1,
    term: "Folders",
    body: "Group related projects one level deep. Folders collapse, you drag projects and folders into the order you want, and a collapsed folder keeps a one-line summary of what inside it needs you. Folders do not nest inside folders, so the list stays a list.",
  },
  {
    n: 2,
    term: "A copy or a Git worktree",
    body: "Duplicate a project, or create a worktree from it, and the new one is listed directly beneath its parent in a stack you can collapse. A copy's dot has a faint twin behind it and a worktree's dot has a small branch mark. Folded, the stack sums up what its rows are doing, for example “2 needs you · 1 running”.",
  },
  {
    n: 3,
    term: "Running state",
    body: "Filled green means something is running, hollow means nothing is, and red means that project's config has an error; hover the row and the tooltip names the problem. A spinner takes the dot's place while lpm is making copies or worktrees of a project, or removing it. Per-service detail and ports stay inside the project, not in the row.",
  },
  {
    n: 4,
    term: "Agent attention",
    body: "Claude Code and Codex report back into the row: the name shimmers while an agent works, turns amber when it needs an answer, turns red and reads “Problem” on an error, and turns blue when it finishes. Underneath, each agent gets its own row with a bell, alert, or check and how long it has been going; click one to jump to its tab. Other agents run fine in a terminal too; their rows light up only if a hook or script reports through lpm set-status.",
  },
  {
    n: 5,
    term: "Your own status marks",
    body: "Tag a project or copy ⏳ In progress, ⛔ Blocked, ✅ Done, one of the ready-made marks like 👀 Review or ⏸️ Paused, or a status you define with your own emoji and label. The mark sits beside the name, with an optional note line under it, so a stack of copies reads like a to-do list.",
  },
  {
    n: 6,
    term: "Paired Macs and hosts",
    body: "A Mac or Linux host you have paired appears as its own section, headed by that machine's name. A new one lands at the bottom of the list; drag its header to move it above your local projects. Its rows open the same project view your local rows do.",
  },
  {
    n: 7,
    term: "Width and collapse",
    body: "Drag the divider anywhere between 160 and 400 px; the default is 260 px and your width is remembered. ⌘B collapses the sidebar out of the way when you want the terminals full-width. That collapsed state is not remembered between launches, so a fresh window always starts with the sidebar showing.",
  },
];

export default function FieldGuide() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Field guide"
          title="What a row can tell you"
          description="Seven things the sidebar communicates, and the deliberate limits on each."
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
