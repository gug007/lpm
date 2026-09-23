import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";
import { CONFIG_PATH } from "@/lib/links";

const PROCFILE = `web: bundle exec puma -C config/puma.rb
worker: bundle exec sidekiq
css: bun run watch:css`;

const PROJECT_YAML = `services:
  web:
    cmd: bundle exec puma -C config/puma.rb
    port: 3000
  worker:
    cmd: bundle exec sidekiq
    dependsOn: [web]
  css: bun run watch:css
profiles:
  api: [web, worker]`;

const CODE = "font-mono text-[0.9em]";

export function Procfile() {
  return (
    <section id="procfile" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The conversion"
          title="Your Procfile, line for line"
          description="lpm writes the three services on the right when you add the folder — same names, same commands. The port label, dependsOn and the profile are what you add after. Keep the Procfile in the repo if Heroku or Foreman still needs it."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <CodeBlock filename="Procfile">{PROCFILE}</CodeBlock>
          <CodeBlock filename="~/.lpm/projects/myapp.yml">
            {PROJECT_YAML}
          </CodeBlock>
        </div>

        <ul className="mt-6 space-y-3">
          <li className="rounded-2xl border border-gray-200 bg-gray-50/50 px-5 py-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            <code className={CODE}>dependsOn</code> orders the start:{" "}
            <code className={CODE}>worker</code> goes up after{" "}
            <code className={CODE}>web</code>, whatever order the lines sit in.
            It sequences the starts rather than waiting for readiness — that is
            what <code className={CODE}>lpm wait</code> is for.
          </li>
          <li className="rounded-2xl border border-gray-200 bg-gray-50/50 px-5 py-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            <code className={CODE}>profiles</code> start a subset:{" "}
            <code className={`${CODE} whitespace-nowrap`}>lpm start --profile api</code>, where Overmind
            takes <code className={`${CODE} whitespace-nowrap`}>overmind start -l web,worker</code> or{" "}
            <code className={CODE}>OVERMIND_PROCESSES</code>.
          </li>
          <li className="rounded-2xl border border-gray-200 bg-gray-50/50 px-5 py-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            <code className={CODE}>port:</code> is a label lpm checks for
            conflicts before starting, and it names the process holding one. It
            is not assigned to your process, so keep exporting{" "}
            <code className={CODE}>PORT</code> yourself. Commit the same services
            and profile as <code className={CODE}>.lpm.yml</code>{" "}
            in the repository to share them.
          </li>
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Every field a service takes —{" "}
          <code className={CODE}>cmd</code>, <code className={CODE}>cwd</code>,{" "}
          <code className={CODE}>port</code>, <code className={CODE}>env</code>,{" "}
          <code className={CODE}>dependsOn</code> — is in the{" "}
          <Link
            href={CONFIG_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            config reference
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
