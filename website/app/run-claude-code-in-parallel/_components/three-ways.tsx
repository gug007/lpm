import Link from "next/link";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { WORKTREE_AGENTS_PATH } from "@/lib/links";
import WaysTable from "./ways-table";
import { WAYS } from "./ways-data";

export default function ThreeWays() {
  return (
    <section id="three-ways" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Three ways"
          title="Three ways to run Claude Code in parallel"
          description="They differ in one thing: whether each agent gets a folder of its own. Pick by task; lpm does all three in one window."
        />

        <div className="grid gap-5 md:grid-cols-3">
          {WAYS.map(({ step, name, icon: Icon, keys, entry, body, link, useWhen, watchOut }) => (
            <article
              key={name}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white/70 p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.02] dark:shadow-none"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {keys && (
                  <span className="flex gap-1.5">
                    {keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-sans text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                )}
              </div>
              <p className="mt-5 text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {step}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {name}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry}</p>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
              {link && (
                <Link
                  href={link.href}
                  className="mt-1 inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
                >
                  {link.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Use it when
              </p>
              <ul className="mt-2 mb-6 flex-1 space-y-2">
                {useWhen.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-snug text-gray-700 dark:text-gray-300"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="flex gap-2 border-t border-gray-100 pt-4 text-[13px] leading-snug text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/80" aria-hidden />
                {watchOut}
              </p>
            </article>
          ))}
        </div>

        <WaysTable />

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Every isolation detail, and what Claude Code and Codex create on their
          own:{" "}
          <Link
            href={WORKTREE_AGENTS_PATH}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
          >
            Git worktrees for AI agents
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
