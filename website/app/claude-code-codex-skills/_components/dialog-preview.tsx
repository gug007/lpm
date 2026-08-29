import Image from "next/image";
import skillsBeforeAfter from "../_assets/skills-before-after.jpg";

export default function DialogPreview() {
  return (
    <section
      id="dialog"
      className="scroll-mt-20 overflow-hidden px-3 pb-20 sm:px-6 sm:pb-28"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-col gap-1 px-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <span className="font-medium text-gray-800 dark:text-gray-200">
            From dotfile spelunking to one dialog
          </span>
          <span className="text-xs">Claude Code · Codex</span>
        </div>
        <figure className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_20%,rgba(217,119,87,0.18),transparent_36%),radial-gradient(circle_at_80%_75%,rgba(16,163,127,0.16),transparent_34%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-black shadow-2xl shadow-black/20 ring-1 ring-white/10 dark:border-white/10 sm:rounded-3xl">
            <Image
              src={skillsBeforeAfter}
              alt="Editing SKILL.md by hand in a terminal, crossed out, next to lpm's New skill dialog with AI drafting, folder, run mode, description, and instructions fields"
              priority
              sizes="(max-width: 896px) 100vw, 896px"
              className="h-auto w-full"
            />
          </div>
          <figcaption className="mt-4 px-3 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:px-0">
            Every field says what it costs: the description is read before every
            turn, the instructions only once the skill actually runs.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
