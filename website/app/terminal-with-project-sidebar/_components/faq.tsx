import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Is the sidebar a project list or a file explorer?",
    answer:
      "A project list. Each row is a project you work on, and selecting it opens that project's terminals, services, and git state. The sidebar itself is only that list: rows do not expand into a file tree and none of them previews a file. Files are one level in — open the project for lpm's review pane and file-by-file diffs, or open its folder in Finder or your editor. lpm is a terminal workspace that sits beside your editor rather than replacing it.",
  },
  {
    question: "Can I resize or hide the project sidebar?",
    answer:
      "Yes. Drag the divider to any width between 160 and 400 pixels; the default is 260 pixels and the width you choose is remembered. ⌘B collapses the sidebar so the terminals go full-width, and pressing it again brings the sidebar back. The collapsed state itself is not remembered between launches, so a new window always opens with the sidebar showing.",
  },
  {
    question: "Can I group projects into folders?",
    answer:
      "Yes. Folders are one level deep — they are called folders in the UI, they collapse, and you drag projects into them and drag folders into the order you want. A folder cannot contain another folder, which keeps the sidebar a list you can scan rather than a tree you have to navigate.",
  },
  {
    question: "Where do duplicates and Git worktrees show up?",
    answer:
      "Directly beneath the project they came from. A duplicate or worktree inherits its parent's name with a suffix, shows that inherited name muted, and its tooltip says which project it is a duplicate or Git worktree of. That keeps a set of parallel copies together instead of scattered through the list in creation order.",
  },
  {
    question: "What do the dots and colours in the sidebar mean?",
    answer:
      "Each project has one dot: filled green when something is running, hollow when nothing is, and red when that project's config has an error. There are no per-service dots, service counts, ports, or health checks in the sidebar — for that you open the project. Separately, Claude Code and Codex report their state into the row itself: the name shimmers while an agent works, turns amber when it needs an answer, red with an alert icon on an error, and blue with a check when it is done.",
  },
  {
    question: "Do SSH projects and paired Macs appear in the sidebar?",
    answer:
      "Yes, in two different ways. An SSH project sits in the same project list as your local ones, with no separate SSH badge on the row. A Mac or host you have paired gets its own section beneath your local projects, headed by that machine's name, and its rows open the same project view.",
  },
  {
    question: "Is there a search box or a command palette for the sidebar?",
    answer:
      "No. There is no sidebar search, no favourites, and no ⌘K palette for projects. The list is meant to stay short enough to scan, and folders plus the order you drag rows into are the tools for keeping it that way. If your list has grown past what you can scan, that is worth knowing about — it is the kind of thing that shapes what gets built next.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions about the project sidebar"
        />
        <ul className="space-y-3">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-sm font-semibold text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-inset focus-visible:outline-none [&::-webkit-details-marker]:hidden dark:text-gray-100 dark:focus-visible:ring-white">
                  <span>{question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
