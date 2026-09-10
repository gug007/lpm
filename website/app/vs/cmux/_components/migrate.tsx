import type { ReactNode } from "react";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const CODE =
  "rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-white/[0.06] dark:text-gray-200";

type Equivalent = {
  from: string;
  to: ReactNode;
  note?: string;
};

const EQUIVALENTS: Equivalent[] = [
  {
    from: "cmux list-workspaces",
    to: <code className={CODE}>lpm list --json</code>,
  },
  {
    from: "cmux notify",
    to: <code className={CODE}>lpm set-status</code>,
    note: "A badge on the tab, a chime, a macOS banner when you are away from the window, and a push to your phone.",
  },
  {
    from: "socket control",
    to: <code className={CODE}>~/.lpm/lpm.sock</code>,
    note: "One shell-quoted command per line.",
  },
  {
    from: "a tab per agent",
    to: (
      <>
        a project copy per agent (<code className={CODE}>lpm worktree</code> /{" "}
        <code className={CODE}>lpm duplicate</code>)
      </>
    ),
  },
  {
    from: "a cmux action or custom command",
    to: (
      <>
        an action in <code className={CODE}>.lpm.yml</code> — a button, or{" "}
        <code className={CODE}>lpm run</code>
      </>
    ),
    note: "Declared once per project, so every copy of that project has it too.",
  },
];

export default function Migrate() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Migration"
          title="What carries over from cmux, and what does not"
          className="mb-12"
        />

        <p className="text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
          Not much to convert — the two files describe different things.{" "}
          <code className={CODE}>cmux.json</code> configures your terminal;{" "}
          <code className={CODE}>.lpm.yml</code> describes your stack.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <CodeBlock filename="~/.config/cmux/cmux.json">
            <Comment>
              {"// app-wide: shortcuts, sidebar, notifications,"}
            </Comment>
            {"\n"}
            <Comment>
              {"// actions, custom commands, workspace layouts"}
            </Comment>
            {"\n"}
            <Comment>{"// (.cmux/cmux.json adds per-repo actions)"}</Comment>
          </CodeBlock>

          <CodeBlock filename="<repo>/.lpm.yml">
            {`services:
  api:
    cmd: npm run dev
    port: 3000
  worker:
    cmd: npm run worker

profiles:
  light: [api]`}
          </CodeBlock>
        </div>

        <ul className="mt-2 space-y-3">
          {EQUIVALENTS.map((row) => (
            <li
              key={row.from}
              className="rounded-2xl border border-gray-200 px-5 py-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {row.from}
                </span>
                <span
                  aria-hidden="true"
                  className="text-gray-500 dark:text-gray-400"
                >
                  &rarr;
                </span>
                <span className="min-w-0 text-gray-900 dark:text-gray-100">
                  {row.to}
                </span>
              </div>
              {row.note && (
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {row.note}
                </p>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Anything in the right-hand column that changes state —{" "}
          <code className={CODE}>lpm start</code>,{" "}
          <code className={CODE}>lpm worktree</code>,{" "}
          <code className={CODE}>lpm service web restart</code>,{" "}
          <code className={CODE}>lpm run</code> — is routed through lpm itself,
          so leave the app open when a script calls one.{" "}
          <code className={CODE}>lpm list</code> and{" "}
          <code className={CODE}>lpm logs</code> read the running services
          themselves, so they answer whether lpm is open or closed. The
          exception among the readers is{" "}
          <code className={CODE}>lpm status</code>, which prints what your
          agents are doing: the app is where those states are kept.
        </p>

        <p className="mt-6 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
          Keeping both is normal: cmux stays your terminal, lpm decides which
          project is up.
        </p>
      </div>
    </section>
  );
}
