import { ArrowDown } from "lucide-react";
import { ConfigShowcase } from "@/components/config/config-showcase";
import { SectionHeader } from "@/components/section-header";

const CODE = "font-mono text-[12px] text-gray-700 dark:text-gray-300";

const PARTS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "services",
    title: "Services",
    body: (
      <>
        Found when you add a folder. Keep a one-line command, or set{" "}
        <code className={CODE}>cwd</code>, <code className={CODE}>port</code>
        {" "}and <code className={CODE}>env</code>.
      </>
    ),
  },
  {
    id: "profiles",
    title: "Profiles",
    body: (
      <>
        Named sets of services. Pick one from the Start menu to boot just that
        set.
      </>
    ),
  },
  {
    id: "actions",
    title: "Actions",
    body: (
      <>
        One-shot commands that show up as buttons — tests, migrations, deploys.
      </>
    ),
  },
  {
    id: "terminals",
    title: "Terminals",
    body: (
      <>
        An action with <code className={CODE}>type: terminal</code>
        {" "}opens a tab that stays open: Claude Code, Codex, a REPL or a log
        tail.
      </>
    ),
  },
];

export function ConfigIntro() {
  return (
    <div
      id="reference"
      className="mb-16 scroll-mt-8 border-t border-gray-100 pt-14 sm:mb-20 sm:pt-16 dark:border-gray-800/70"
    >
      <SectionHeader
        eyebrow="Reference"
        title="Or write the config yourself"
        description={
          <>
            Add or clone a folder and lpm fills in its dev servers.
            <span className="hidden md:inline">
              {" "}Change them here, add a profile or an action, and the
              preview updates as you type.
            </span>
          </>
        }
        className="mb-10"
      />

      <div>
        <ConfigShowcase />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARTS.map((part) => (
            <a
              key={part.id}
              href={`#${part.id}`}
              className="group rounded-xl border border-gray-200 px-4 py-3.5 transition-colors duration-200 hover:border-gray-300 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.02]"
            >
              <span className="mb-1 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100">
                {part.title}
                <ArrowDown
                  className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
              </span>
              <span className="block text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                {part.body}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
