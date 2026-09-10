import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

type Side = {
  title: string;
  body: ReactNode;
};

const SIDES: Side[] = [
  {
    title: "Native in lpm",
    body: (
      <>
        Your Rails or Django server, the Next.js dev server, a Go binary,
        background workers, anything with a file watcher. Each is one line of
        YAML with a pane of its own; the watcher inside it picks up your edits,
        and if the process dies the pane keeps the exit code on screen until you
        start it again.
      </>
    ),
  },
  {
    title: "Left in compose",
    body: (
      <>
        Postgres, Redis, Kafka, Elasticsearch, LocalStack, a vendor image nobody
        installs natively. Declare the attached form as one lpm service —{" "}
        <code className="font-mono text-[0.9em]">db: docker compose up</code>,
        not{" "}
        <code className="font-mono text-[0.9em]">-d</code>{" "}
        — and its output lands in a pane next to the rest.
      </>
    ),
  },
];

const STEPS: { id: string; body: ReactNode }[] = [
  {
    id: "generate",
    body: (
      <>
        In the config editor, press Generate with AI: the agent CLI you already
        have — Claude Code, Codex, Gemini CLI or OpenCode — reads the repo,{" "}
        <code className="font-mono text-[0.9em]">docker-compose.yml</code>{" "}
        included, and drafts the first pass at the service list.
      </>
    ),
  },
  {
    id: "move",
    body: (
      <>
        Move the processes with file watchers out of the compose file and into{" "}
        <code className="font-mono text-[0.9em]">services:</code>, one at a
        time.
      </>
    ),
  },
  {
    id: "start",
    body: (
      <>
        Leave the rest as a single compose service and bring the project up with
        one click — or{" "}
        <code className="font-mono text-[0.9em]">lpm start</code>, with the
        window open.
      </>
    ),
  },
];

export function SplitStack() {
  return (
    <section id="split" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The setup most people land on"
          title="Native where it is fast, containers where they earn it"
          description="There is no migration to finish. Compose keeps the services you want pinned; lpm runs the code you edit."
        />

        <div className="grid gap-4 md:grid-cols-2 text-left">
          {SIDES.map((side) => (
            <article
              key={side.title}
              className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {side.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {side.body}
              </p>
            </article>
          ))}
        </div>

        <ol className="mt-4 grid gap-4 md:grid-cols-3 text-left">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <span className="text-xs font-semibold tabular-nums tracking-widest text-gray-500 dark:text-gray-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
