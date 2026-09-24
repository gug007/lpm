import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Do my terminals keep running when I switch projects?",
    answer:
      "Yes. Selecting another row swaps the workspace, but a project you have opened stays mounted: its terminals keep running, their scrollback stays, and a half-typed command is still at the prompt when you come back. Services run until you stop the project, and if Claude Code or Codex needs an answer while you are in another project, that project's row turns amber.",
  },
  {
    question: "Is the sidebar a project list or a file explorer?",
    answer:
      "A project list. Each row is a project you work on, and selecting it opens that project's terminals, services, and git state. The sidebar itself is only that list: rows do not expand into a file tree and none of them previews a file. Files are one level in: open the project's Files tab (⌘⇧E) for a tree and an editor, or its Changes view (⌘⇧R) for diffs, or send the folder to Finder or your editor with Open with.",
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
      "Directly beneath the project they came from, in a stack you can collapse. A duplicate or worktree inherits its parent's name with a suffix, a copy's dot has a faint twin and a worktree's dot a small branch mark, and the tooltip says which project it came from. Folded, the stack shows a one-line tally such as 2 needs you · 1 running, so a set of parallel copies stays together instead of scattered through the list.",
  },
  {
    question: "What do the dots and colours in the sidebar mean?",
    answer:
      "Each project has one dot: filled green when something is running, hollow when nothing is, and red when that project's config has an error. While lpm is making copies or worktrees of a project, or removing it, a spinner takes the dot's place. There are no per-service dots or ports in the sidebar; for that you open the project. Separately, Claude Code and Codex report their state into the row itself: the name shimmers while an agent works, turns amber when it needs an answer, turns red and reads Problem on an error, and turns blue when it is done. Each agent also gets its own row underneath with a bell, alert, or check and its elapsed time.",
  },
  {
    question: "Do SSH projects and paired Macs appear in the sidebar?",
    answer:
      "Yes, in two different ways. An SSH project sits in the same project list as your local ones, with no separate SSH badge on the row. A Mac or Linux host you have paired gets its own section, headed by that machine's name. It starts at the bottom of the list and you can drag it anywhere, above your local projects too; its rows open the same project view.",
  },
  {
    question: "Is there a search box or a command palette for the sidebar?",
    answer:
      "There is no search box in the sidebar. Use ⌘1–⌘9 to jump to one of the first nine projects, hold Ctrl and tap Tab to flip between the ones you used last, or press ⌘⇧A for Activity, a searchable list of the Claude Code and Codex sessions, running services, and automations across your projects. Folders and the order you drag rows into keep the list itself scannable.",
  },
  {
    question: "Can I mark a project as blocked or done?",
    answer:
      "Yes. Right-click a project or copy and open Status to give it a work status: ⏳ In progress, 👀 Review, 🚀 Ready, ✅ Done, ⛔ Blocked with a reason, ⏰ Waiting, ❓ Needs decision, ⏸️ Paused, or one you define with your own emoji and label. The mark sits beside the name with an optional note line, and a collapsed folder or stack of copies counts them in its summary.",
  },
  {
    question: "What else can I do from a sidebar row?",
    answer:
      "Right-click a row for its git menu (pull, push, commit, create a PR, switch branch), Duplicate and New Worktree, Open with your editor, Rename, and Detach to new window. Shift-click selects several projects to move into a folder or remove at once, and you can turn on double-click to start or stop a project in Settings.",
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
