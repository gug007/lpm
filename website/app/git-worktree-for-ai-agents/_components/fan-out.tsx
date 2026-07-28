import type { ReactNode } from "react";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const Flag = ({ children }: { children: ReactNode }) => (
  <code className="whitespace-nowrap font-mono text-[0.9em]">{children}</code>
);

const MODES: {
  command: string;
  title: string;
  body: ReactNode;
  code: string;
}[] = [
  {
    command: "lpm worktree",
    title: "Linked worktrees, created in a batch",
    body: (
      <>
        Each one is a real Git worktree on its own <Flag>lpm/&lt;name&gt;</Flag>{" "}
        branch, sharing the repository. Dependencies are not carried over — add{" "}
        <Flag>--reinstall-deps</Flag> when the copy needs them.
      </>
    ),
    code: 'lpm worktree myapp -n 3 --reinstall-deps \\\n  --run claude \\\n  --prompt "Fix the checkout race condition"',
  },
  {
    command: "lpm duplicate",
    title: "Standalone copies of the project you have now",
    body: (
      <>
        An APFS copy-on-write clone with its own <Flag>.git</Flag> directory,
        carrying uncommitted work, ignored files, and installed dependencies.
        Regenerable build caches are skipped.
      </>
    ),
    code: 'lpm duplicate myapp -n 3 \\\n  --run claude \\\n  --prompt "Fix the checkout race condition"',
  },
];

export default function FanOut() {
  return (
    <section id="fan-out" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="One command, three agents"
          title="Both primitives, the same fan-out"
          description="lpm does not ask you to give up worktrees. It gives the same batch creation, queued prompt, and cleanup to either isolation model."
          className="mb-12"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {MODES.map((mode) => (
            <article
              key={mode.command}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <p className="font-mono text-[13px] font-semibold text-gray-500 dark:text-gray-400">
                {mode.command}
              </p>
              <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                {mode.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {mode.body}
              </p>
              <div className="mt-5">
                <CodeBlock>{mode.code}</CodeBlock>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10">
          <CodeBlock filename="Then wait, review, and clean up">
            <Comment>
              # each copy prints its name as it is created, e.g. myapp-a1b2c3
            </Comment>
            {"\n"}lpm wait myapp-a1b2c3 --agent --timeout 900
            {"\n"}lpm remove myapp-a1b2c3
          </CodeBlock>
          <p className="mt-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            The same commands are available to the agents themselves. lpm
            installs skills for Claude Code and Codex, so an agent can create
            its own copies, wait for the others to settle, and remove them when
            the work is merged.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-950 shadow-2xl shadow-gray-200/60 dark:border-gray-800 dark:shadow-black/40">
          <video
            src="/screenrecording/agent-duplicate-fanout.mp4"
            poster="/screenrecording/agent-duplicate-fanout-poster.jpg"
            width={1224}
            height={804}
            controls
            muted
            loop
            playsInline
            preload="none"
            aria-label="Fanning one prompt out to three project copies in lpm, each running its own coding agent"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
