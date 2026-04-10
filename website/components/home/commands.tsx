import { ChevronRight, Terminal } from "lucide-react";

const COMMANDS: [string, string][] = [
  ["lpm <project>", "Start in background"],
  ["lpm start <project>", "Start and open terminal"],
  ["lpm switch <project>", "Stop all, start another"],
  ["lpm kill [project]", "Stop a project (all if none given)"],
  ["lpm init [name]", "Create config from current directory"],
  ["lpm edit <project>", "Open config in $EDITOR"],
  ["lpm list", "List all projects"],
  ["lpm status <project>", "Show project details"],
  ["lpm open <project>", "View a running project's live output"],
  ["lpm run <project> <action>", "Run a project action"],
];

export function Commands() {
  return (
    <section className="pb-20">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          Simple, powerful commands
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-8">
          Everything you need to manage local projects, nothing you don&apos;t.
        </p>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900/50">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
            <Terminal className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              lpm --help
            </span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {COMMANDS.map(([cmd, desc]) => (
              <div
                key={cmd}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group"
              >
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-700 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors flex-shrink-0" />
                <code className="text-xs font-mono text-gray-900 dark:text-gray-200 whitespace-nowrap w-2/5">
                  {cmd}
                </code>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
