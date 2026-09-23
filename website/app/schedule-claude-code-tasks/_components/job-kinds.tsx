import {
  FolderGit2,
  MousePointerClick,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { JobEditorReplica } from "./job-editor-replica";

const KINDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "AI prompt",
    body: "Claude Code, Codex, Gemini CLI or OpenCode. For Claude Code and Codex, also pick the model and reasoning effort. Set access to Full or Read only.",
  },
  {
    icon: SquareTerminal,
    title: "Command",
    body: "Any shell command, run in the project folder: refresh fixtures, rebuild a cache, run a report.",
  },
  {
    icon: MousePointerClick,
    title: "Action",
    body: "One of the project's saved actions, the same buttons you click in lpm, now on a timer.",
  },
];

const PLACES = [
  {
    term: "Runs in",
    detail:
      "One project, several at once, or none. A job with no project runs from your home folder.",
  },
  {
    term: "Works on",
    detail:
      "The project itself, a fresh copy of it, or a new Git worktree. Pick a copy or a worktree and the folder you work in stays untouched.",
  },
];

export default function JobKinds() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Build a job"
          title="Prompt an agent, run a command, or press a button"
          description="Each job does one thing on its schedule. You set it up in one form, and the same form edits it later."
          className="mb-12"
        />
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="space-y-8 lg:sticky lg:top-24 lg:pt-4">
            <ul className="space-y-6">
              {KINDS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-gray-200 bg-gray-50/40 p-6 dark:border-gray-800 dark:bg-white/[0.02]">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <FolderGit2 className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
                Where it runs
              </p>
              <dl className="mt-4 space-y-3">
                {PLACES.map(({ term, detail }) => (
                  <div key={term} className="text-sm leading-relaxed">
                    <dt className="inline font-medium text-gray-800 dark:text-gray-200">
                      {term}:
                    </dt>{" "}
                    <dd className="inline text-gray-500 dark:text-gray-400">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-lg lg:max-w-none">
            <JobEditorReplica />
            <figcaption className="mt-4 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              The job editor: a nightly Claude Code run that works in a fresh copy
              of the project.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
