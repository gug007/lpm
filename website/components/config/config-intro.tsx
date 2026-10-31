import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ConfigShowcase } from "@/components/config/config-showcase";
import { docsPath, type DocsSlug } from "@/lib/docs-pages";

const CODE = "font-mono text-[12px] text-gray-700 dark:text-gray-300";

const PARTS: { id: DocsSlug; title: string; body: React.ReactNode }[] = [
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
    <section className="mt-14">
      <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
        Or write the config yourself
      </h2>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Add or clone a folder and lpm fills in its dev servers.
        <span className="hidden md:inline">
          {" "}Change them here, add a profile or an action, and the preview
          updates as you type.
        </span>
      </p>

      <ConfigShowcase />

      <div className="grid gap-3 sm:grid-cols-2">
        {PARTS.map((part) => (
          <Link
            key={part.id}
            href={docsPath(part.id)}
            className="group rounded-xl border border-gray-200 px-4 py-3.5 transition-colors duration-200 hover:border-gray-300 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.02]"
          >
            <span className="mb-1 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100">
              {part.title}
              <ArrowRight
                className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="block text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
              {part.body}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
