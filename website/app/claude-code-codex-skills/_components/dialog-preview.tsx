import Image from "next/image";
import { Bot, FileText, Folder, ScrollText } from "lucide-react";
import skillsBeforeAfter from "../_assets/skills-before-after.jpg";

const FIELDS = [
  {
    icon: Folder,
    title: "Folder",
    copy: "Saved straight into a folder the CLI you pick already reads — no wondering where the skill goes.",
  },
  {
    icon: Bot,
    title: "Who runs it",
    copy: "Your agent, when the description fits — or manual-only, invoked with /name or $name.",
  },
  {
    icon: FileText,
    title: "Description",
    copy: "The only part your agent reads before deciding to open the skill. lpm shows its per-turn token cost.",
  },
  {
    icon: ScrollText,
    title: "Instructions",
    copy: "Read only once the skill runs, so their length costs nothing up front.",
  },
];

export default function DialogPreview() {
  return (
    <section
      id="dialog"
      className="scroll-mt-20 overflow-hidden px-3 pb-20 sm:px-6 sm:pb-28"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-2 px-3 sm:flex-row sm:items-end sm:justify-between sm:px-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-950 dark:text-white">
              From dotfile spelunking to one dialog
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              A skill is a SKILL.md file in a dotfolder — easy for agents to
              read, fiddly for you to maintain. lpm turns it into a form, with
              an AI Draft bar that fills every field from one sentence.
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
            Claude Code · Codex
          </span>
        </div>
        <figure className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_20%,rgba(217,119,87,0.18),transparent_36%),radial-gradient(circle_at_80%_75%,rgba(16,163,127,0.16),transparent_34%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-black shadow-2xl shadow-black/20 ring-1 ring-white/10 dark:border-white/10 sm:rounded-3xl">
            <Image
              src={skillsBeforeAfter}
              alt="Editing SKILL.md by hand in a terminal, crossed out, next to lpm's New skill dialog with AI drafting, folder, run mode, description, and instructions fields"
              priority
              placeholder="blur"
              quality={90}
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="h-auto w-full"
            />
          </div>
        </figure>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map(({ icon: Icon, title, copy }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#151515]"
            >
              <div className="flex items-center gap-2">
                <Icon
                  className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  {title}
                </h3>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                {copy}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
