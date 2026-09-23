import { BookmarkPlus, Brain, Forward, type LucideIcon } from "lucide-react";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const STEPS: { icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  {
    icon: BookmarkPlus,
    title: "Remember",
    body: (
      <>
        Ask Claude Code to remember the session, or pick Remember this
        conversation from the prompt box&apos;s Memory button. The agent saves a
        named session with the goal, where things stand, and a timeline.
      </>
    ),
  },
  {
    icon: Forward,
    title: "Hand off",
    body: (
      <>
        Open Codex, Gemini CLI, or OpenCode tomorrow and ask it to continue
        the auth-refactor session; in Claude Code,{" "}
        <code className="font-mono text-xs whitespace-nowrap">/lpm-memory auth-refactor</code>{" "}
        does the same. It reads the current state first and picks up the
        next step.
      </>
    ),
  },
  {
    icon: Brain,
    title: "Keep it tidy",
    body: (
      <>
        ⌘⇧M opens the Memory tab to browse, edit, rename, or delete sessions.
        Copies and worktrees share their original&apos;s memory, so a parallel
        run can report back to the same session.
      </>
    ),
  },
];

export default function Memory() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Shared session memory"
          title="Hand work from Claude Code to Codex, and back"
          description="A third skill, lpm-memory, gives every agent the same per-project notebook. Stop in one CLI, continue in another, and nobody starts from zero."
          className="mb-12"
        />
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <CodeBlock filename="auth-refactor.md">
            # Auth refactor
            {"\n\n"}## Goal
            {"\n"}Move sessions from cookies to signed tokens.
            {"\n\n"}## Current state
            {"\n"}Token issuing works; refresh flow is next.
            {"\n"}Blocked on the mobile client&apos;s token storage.
            {"\n\n"}## Timeline
            {"\n"}### 2026-09-22 09:40 — claude
            {"\n"}- Done: issue and verify tokens in the API
            {"\n"}- Next: refresh endpoint
            {"\n\n"}### 2026-09-23 14:05 — codex
            {"\n"}- Done: refresh endpoint and tests
            {"\n"}- Open: where the mobile app keeps the token
          </CodeBlock>
          <ol className="space-y-7">
            {STEPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-white/[0.06]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Memory is read only when you ask for it, so nothing is added to every
          session on its own. Sessions stay on your Mac, separate from each
          CLI&apos;s built-in memory, and are available for local projects.
        </p>
      </div>
    </section>
  );
}
