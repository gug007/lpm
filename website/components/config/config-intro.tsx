import { ArrowDown } from "lucide-react";
import { ConfigShowcase } from "@/components/config/config-showcase";

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
    <div className="mb-16 sm:mb-20">
      <div className="mb-6 text-center lg:text-left">
        <h2 className="text-balance text-xl font-bold tracking-tight sm:text-2xl">
          <span className="md:hidden">What a project config looks like</span>
          <span className="hidden md:inline">
            Try it: edit a config, watch the app
          </span>
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-gray-500 sm:text-base dark:text-gray-400">
          Add or clone a folder and lpm fills in its dev servers.
          <span className="hidden md:inline">
            {" "}Change them here, add a profile or an action, and the preview
            updates as you type.
          </span>
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-8">
        <div className="min-w-0">
          <ConfigShowcase />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:content-start">
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
