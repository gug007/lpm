import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";
import { CONFIG_PATH } from "@/lib/links";

const TMUXINATOR_YAML = `name: myapp
root: ~/Projects/myapp

windows:
  - web: npm run dev
  - api: go run ./cmd/server
  - db: docker compose up postgres`;

const LPM_YAML = `name: myapp
root: ~/Projects/myapp

services:
  web: npm run dev
  api:
    cmd: go run ./cmd/server
    cwd: ./backend
    dependsOn: [db]
  db: docker compose up postgres`;

export default function Migrate() {
  return (
    <section id="migrate" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Migration"
          title="Coming from tmuxinator"
          description="A tmuxinator project is a window list. An lpm project is a service map. The translation is mechanical, and adding the folder already does most of it."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <CodeBlock filename="~/.config/tmuxinator/myapp.yml">
            {TMUXINATOR_YAML}
          </CodeBlock>
          <CodeBlock filename="~/.lpm/projects/myapp.yml">
            {LPM_YAML}
          </CodeBlock>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Two things a window list cannot express: <code>dependsOn</code>, so{" "}
          <code>db</code> is up before <code>api</code> goes looking for it, and{" "}
          <code>profiles</code>, so <code>profiles: {"{"} frontend: [web] {"}"}</code>{" "}
          gives you a smaller stack on the days you do not need the rest.{" "}
          <code>dependsOn</code> sets the order, not readiness —{" "}
          <code className="whitespace-nowrap">lpm wait --port 5432</code>{" "}is the gate. Put the same services
          in a <code>.lpm.yml</code>{" "}at the repo root and your team gets them
          on clone, next to anything lpm picks up from the repo on their machine.
          The reference documents{" "}
          <Link
            href={CONFIG_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            every field
          </Link>{" "}
          a project file takes.
        </p>
      </div>
    </section>
  );
}
